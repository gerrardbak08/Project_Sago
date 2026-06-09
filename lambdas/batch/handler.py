"""
batch-orchestrator Lambda 핸들러

EventBridge 트리거: 매일 06:00 KST (cron(0 21 * * ? *) UTC)

전체 영업 매장 순회 → 안전 가이드 생성 → 발송(MockNotifier) → S3 기록

환경변수:
    MODELS_BUCKET   : stores.json + 모델 파일이 있는 S3 버킷
    FRONTEND_BUCKET : alerts/ 기록용 S3 버킷 (대시보드에서 조회)
    DAILY_BUCKET    : 배치 전체 결과 저장 S3 버킷 (daily/{date}/results.json)
    NOTIFY_CHANNEL  : "mock" (기본) 또는 "kakao" (나중에)
    BEDROCK_REGION  : Bedrock 리전 (기본 us-east-1)
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any

from core.weather import get_weather
from core.rule_matcher import match_with_fallback, compute_confidence, expand_with_siblings
from core.risk_score import compute_risk_score
from core.llm import generate_guide
from core.notifier import get_notifier
from core.recipients import resolve_recipients
from core.alert_state import (
    get_state as alert_state_get,
    record_sent as alert_state_record_sent,
    should_skip_for_cooldown,
)
from core.media import pick_media_for_results

try:
    from scripts.media_prompts import TARGETS as _MEDIA_TARGETS
    _KNOWN_MEDIA = set(_MEDIA_TARGETS)
except Exception:
    _KNOWN_MEDIA = None

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))

SOURCES = ["cust", "emp"]
LABEL_COLS = {"cust": "사고유형", "emp": "재해 유형"}
SOURCE_LABEL = {"cust": "고객 안전 (CUST)", "emp": "직원 안전 (EMP)"}

WEATHER_FEATURES = [
    "temperature_2m_min", "temperature_2m_max",
    "precipitation_sum", "snowfall_sum", "rain_sum",
    "wind_speed_10m_max", "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]

STORE_NUM_FEATURES = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]

# ──────────────────────────────────────────────
# S3 로딩 + 메모리 캐싱
# ──────────────────────────────────────────────
_cache: dict[str, Any] = {}


def _load_json_s3(key: str) -> Any:
    if key in _cache:
        return _cache[key]
    import boto3
    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        raise ValueError("MODELS_BUCKET 환경변수가 설정되지 않았습니다.")
    s3 = boto3.client("s3")
    resp = s3.get_object(Bucket=bucket, Key=key)
    data = json.loads(resp["Body"].read().decode("utf-8"))
    _cache[key] = data
    print(f"[batch] S3 로드: s3://{bucket}/{key}")
    return data


def _load_json_s3_optional(key: str, default: Any = None) -> Any:
    """S3에서 JSON을 로드하되 파일이 없으면 default를 반환한다."""
    try:
        return _load_json_s3(key)
    except Exception:
        return default if default is not None else {}


def _load_stores() -> list[dict]:
    return _load_json_s3("stores.json")


def _load_model_files(source: str) -> tuple[dict, dict, dict, dict, dict, dict, dict, dict]:
    prefix = f"models/{source}"
    return (
        _load_json_s3(f"{prefix}/tree_rules.json"),
        _load_json_s3(f"{prefix}/leaf_table.json"),
        _load_json_s3(f"{prefix}/metadata.json"),
        _load_json_s3(f"{prefix}/encoder_map.json"),
        _load_json_s3(f"{prefix}/siblings.json"),
        _load_json_s3_optional(f"{prefix}/calibration.json"),
        _load_json_s3_optional(f"{prefix}/severity_weights.json"),
        _load_json_s3_optional(f"{prefix}/risk_policy.json"),
    )


def _load_recipients() -> dict:
    """recipients.json 로드. 캐시 미사용 — 스키마 편집 즉시 반영. 실패 시 빈 구조."""
    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        return {"default": [], "stores": {}}
    try:
        import boto3
        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=bucket, Key="recipients.json")
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception as e:
        print(f"[batch] recipients.json 로드 실패 (기본값 사용): {e}")
        return {"default": [], "stores": {}}


# ──────────────────────────────────────────────
# 피처 구성
# ──────────────────────────────────────────────
def _build_features(weather: dict, store: dict, encoder_map: dict) -> dict[str, float]:
    features: dict[str, float] = {}
    for feat in WEATHER_FEATURES:
        val = weather.get(feat)
        features[feat] = float(val) if val is not None else 0.0
    for feat in STORE_NUM_FEATURES:
        val = store.get(feat)
        features[feat] = float(val) if val is not None else 0.0
    store_type = store.get("형태", "직영점")
    type_mapping = encoder_map.get("형태", {})
    features["형태"] = float(type_mapping.get(store_type, type_mapping.get("직영점", 2)))
    return features


# ──────────────────────────────────────────────
# 단일 매장 가이드 생성
# ──────────────────────────────────────────────
def _risk_thresholds(risk_policy: dict | None) -> dict | None:
    """risk_policy.json + 환경변수 override로 thresholds dict 구성. 없으면 None(기본값)."""
    th: dict = {}
    if risk_policy and risk_policy.get("theta_score") is not None:
        th = {
            "theta_score": risk_policy["theta_score"],
            "theta_high": risk_policy.get("theta_high", risk_policy["theta_score"]),
            "tau": risk_policy.get("tau", 1.0),
        }
    env = os.environ.get("RISK_SCORE_THRESHOLD")
    if env:
        try:
            th["theta_score"] = float(env)
        except ValueError:
            pass
    return th or None


def _score_store(store: dict, date_str: str) -> dict:
    """LLM 없이 매장×조건의 위험 점수를 계산한다 (트리거 게이트 입력).

    반환 results[source]는 risk 결과 + LLM 단계용 캐시(_leaf_data/_label_col)를 포함.
    """
    store_code = str(store.get("매장", ""))
    store_name = store.get("매장명", "")
    lat = store.get("위도")
    lon = store.get("경도")

    if lat is None or lon is None:
        return {"store_code": store_code, "store_name": store_name, "error": "위경도 정보 없음"}

    weather = get_weather(float(lat), float(lon), date_str)
    if weather is None:
        weather = {feat: 0.0 for feat in WEATHER_FEATURES}
        print(f"[batch] 기상 조회 실패 → 기본값: {store_name}")

    results: dict[str, Any] = {}
    for source in SOURCES:
        try:
            (tree_rules, leaf_table, metadata, encoder_map, siblings,
             calibration, severity_weights, risk_policy) = _load_model_files(source)
        except Exception as e:
            results[source] = {"error": str(e)}
            continue

        label_col = LABEL_COLS.get(source, metadata.get("label_column", "사고유형"))
        features = _build_features(weather, store, encoder_map)
        leaf_id, leaf_data, fallback_level = match_with_fallback(
            features, tree_rules, leaf_table, siblings, metadata
        )
        if leaf_data is None:
            results[source] = {"error": "리프 매칭 실패"}
            continue

        leaf_summary = leaf_data.get("summary", {})
        class_counts = leaf_summary.get(label_col) if fallback_level == 0 else None
        confidence = compute_confidence(
            fallback_level, leaf_summary.get("total", 0), class_counts, calibration
        )
        # cross-leaf 재정렬: level 0이면 직계 형제 리프 사례를 후보 풀에 추가
        if fallback_level == 0:
            leaf_data = expand_with_siblings(leaf_id, leaf_data, leaf_table, siblings)

        # 위험 점수 — features를 today_store로 재사용(형태 인코딩 일치, weather 포함)
        risk = compute_risk_score(
            rule_str=leaf_data.get("rule", ""),
            class_counts=leaf_summary.get(label_col),
            incidents=leaf_data.get("incidents", []),
            today_weather=weather,
            today_store=features,
            feature_stats=metadata.get("feature_stats", {}),
            confidence=confidence,
            severity_weights=(severity_weights or {}).get("weights", {}),
            thresholds=_risk_thresholds(risk_policy),
            weights=(risk_policy or {}).get("weights"),
        )

        results[source] = {
            "leaf_id": str(leaf_id) if leaf_id is not None else None,
            "fallback_level": fallback_level,
            "confidence": confidence,
            "matched_rule": leaf_data.get("rule", ""),
            "incident_count": leaf_summary.get("total", 0),
            "risk": risk,
            "_leaf_data": leaf_data,
            "_label_col": label_col,
        }

    return {
        "store_code": store_code,
        "store_name": store_name,
        "region": store.get("지역", ""),
        "date": date_str,
        "weather": weather,
        "results": results,
    }


def _generate_guide_for(scored: dict, store: dict) -> dict:
    """트리거된 source만 generate_guide(Bedrock) 호출. guide_result 형태로 조립.

    내부 캐시 키(_leaf_data/_label_col)는 결과에서 제거한다.
    """
    weather = scored.get("weather", {})
    out_results: dict[str, Any] = {}
    for source, sd in scored.get("results", {}).items():
        if "error" in sd:
            out_results[source] = sd
            continue
        entry = {k: sd[k] for k in (
            "leaf_id", "fallback_level", "confidence", "matched_rule", "incident_count", "risk"
        )}
        if sd.get("risk", {}).get("trigger"):
            entry["guide"] = generate_guide(
                store, weather, sd["_leaf_data"], sd["_label_col"], sd["confidence"]
            )
        out_results[source] = entry

    return {
        "store_code": scored.get("store_code", ""),
        "store_name": scored.get("store_name", ""),
        "region": scored.get("region", ""),
        "date": scored.get("date", ""),
        "weather": weather,
        "results": out_results,
    }


def _aggregate_severity(scored: dict) -> str:
    """트리거된 source 중 하나라도 severity=high면 high (쿨다운 override 호환)."""
    for sd in scored.get("results", {}).values():
        risk = sd.get("risk", {}) if isinstance(sd, dict) else {}
        if risk.get("trigger") and risk.get("severity") == "high":
            return "high"
    return "normal"


# ──────────────────────────────────────────────
# 메시지 본문 구성
# ──────────────────────────────────────────────
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [f"🏪 {store_name} 안전 가이드", f"📅 날짜: {date_str}", ""]
    for source in SOURCES:
        source_data = results.get(source, {})
        lines.append(f"━━ {SOURCE_LABEL.get(source, source.upper())} ━━")
        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
        else:
            guide = source_data.get("guide", {})
            lines.append(f"⚠️ {guide.get('위험_요약', '정보 없음')}")
            if guide.get("오늘의_특별_주의사항"):
                lines.append("  [오늘 특별 주의]")
                for item in guide["오늘의_특별_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
            if guide.get("상시_주의사항"):
                lines.append("  [상시 주의]")
                for item in guide["상시_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
        lines.append("")

    media_urls = pick_media_for_results(results, _KNOWN_MEDIA)
    if media_urls:
        lines.append("🖼️ 안전 일러스트")
        for u in media_urls:
            lines.append(f"  | {u}")
        lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# 알림 현황 S3 기록 (frontend 버킷 — 대시보드 조회용)
# ──────────────────────────────────────────────
def _build_recipients_list(
    receiver_uuids: list[str],
    recipients_data: dict,
    store_name: str,
) -> list[dict]:
    """UUID 목록을 recipients.json 데이터와 조인해 이름/역할/팀 정보를 담은 dict 리스트로 반환.

    recipients.json에 상세 정보가 없으면 uuid만 담아 반환한다.
    """
    uuid_set = set(receiver_uuids)
    # recipients.json 안에 "users" 키가 있으면 거기서 상세 정보를 조회한다.
    users_map: dict = {}
    for entry in recipients_data.get("users", []):
        uid = entry.get("uuid") or entry.get("id", "")
        if uid:
            users_map[uid] = entry

    result: list[dict] = []
    for uid in receiver_uuids:
        info = users_map.get(uid, {})
        result.append({
            "uuid": uid,
            "name": info.get("name") or info.get("이름", ""),
            "role": info.get("role") or info.get("직책", ""),
            "team": info.get("team") or info.get("팀", ""),
            "store_name": info.get("store_name") or store_name,
        })
    return result


def _build_message_summary(results: dict) -> str:
    """결과 dict에서 사람이 읽을 수 있는 위험 요약 문자열을 만든다.

    예: '낙상 위험 — 위험점수 0.82 (고객), 0.75 (직원)'
    """
    parts: list[str] = []
    for source, sd in results.items():
        if not isinstance(sd, dict) or "error" in sd:
            continue
        risk = sd.get("risk", {})
        if not risk.get("trigger"):
            continue
        score = risk.get("score")
        accident_type = (
            sd.get("guide", {}).get("주요_위험유형")
            or risk.get("reason", "")
        )
        label = "고객" if source == "cust" else "직원"
        score_str = f"{score:.2f}" if isinstance(score, (int, float)) else "N/A"
        if accident_type:
            parts.append(f"{accident_type} — 위험점수 {score_str} ({label})")
        else:
            parts.append(f"위험점수 {score_str} ({label})")
    return " | ".join(parts) if parts else ""


def _max_risk_score(results: dict) -> float | None:
    """트리거된 source 중 최대 위험 점수를 반환한다. 없으면 None."""
    scores: list[float] = []
    for sd in results.values():
        if not isinstance(sd, dict) or "error" in sd:
            continue
        score = sd.get("risk", {}).get("score")
        if isinstance(score, (int, float)):
            scores.append(float(score))
    return max(scores) if scores else None


def _record_alert(
    s3_client: Any,
    guide_result: dict,
    channel: str,
    trigger_type: str,
    delivery: dict | None = None,
    recipients_data: dict | None = None,
    receiver_uuids: list[str] | None = None,
) -> None:
    """발송 결과를 frontend 버킷의 alerts/{date}/{store_code}.json 에 저장한다.

    파일 1개 = 매장 1개. 같은 날 재실행 시 덮어씀 (멱등).
    """
    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")
    if not frontend_bucket:
        print("[batch] FRONTEND_BUCKET 미설정 → 기록 스킵")
        return

    store_code = guide_result.get("store_code", "unknown")
    store_name = guide_result.get("store_name", "")
    date_str = guide_result.get("date", "unknown")
    file_key = f"alerts/{date_str}/{store_code}.json"

    results = guide_result.get("results", {})
    cust = results.get("cust", {})
    emp = results.get("emp", {})

    recipients_list = _build_recipients_list(
        receiver_uuids or [],
        recipients_data or {},
        store_name,
    )
    risk_score = _max_risk_score(results)

    record = {
        **guide_result,
        "trigger": "batch_auto",
        "trigger_type": trigger_type,
        "channel": channel,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "sent_at": datetime.utcnow().isoformat() + "Z",
        "delivery_status": delivery.get("status", "not_sent") if delivery else "not_sent",
        "sent_recipients": delivery.get("sent", []) if delivery else [],
        "failed_recipients": delivery.get("failed", []) if delivery else [],
        "recipients": recipients_list,
        "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
        "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
        "message_summary": _build_message_summary(results),
        "store_name": store_name,
        "risk_score": risk_score,
        "detail_key": file_key,
    }

    try:
        s3_client.put_object(
            Bucket=frontend_bucket,
            Key=file_key,
            Body=json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[batch] 현황 기록: {store_code} → s3://{frontend_bucket}/{file_key}")
    except Exception as e:
        print(f"[batch] 파일 저장 실패 ({store_code}): {e}")


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """배치 오케스트레이터 Lambda 메인 핸들러.

    EventBridge 트리거: 매일 06:00 KST
    """
    import boto3

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")
    timestamp = now.isoformat(timespec="seconds")
    channel = os.environ.get("NOTIFY_CHANNEL", "mock")

    print(f"[batch] 배치 시작: {timestamp}")

    s3_client = boto3.client("s3")
    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    notifier = get_notifier(channel)

    # stores.json 로드
    try:
        all_stores = _load_stores()
    except Exception as e:
        print(f"[batch] 치명적 오류: {e}")
        return {"date": date_str, "timestamp": timestamp, "error": str(e)}

    # 환경변수 BATCH_STORE_CODES로 대상 매장 지정
    # 형식: "10130,10481,10931,11071,11224" (쉼표 구분 매장코드)
    store_codes_env = os.environ.get("BATCH_STORE_CODES", "")
    if store_codes_env:
        target_codes = {int(c.strip()) for c in store_codes_env.split(",") if c.strip()}
        active_stores = [
            s for s in all_stores
            if s.get("폐점여부") == "영업" and int(s["매장"]) in target_codes
        ]
        print(f"[batch] 지정 매장 {len(target_codes)}개 중 {len(active_stores)}개 영업 확인")
    else:
        # 환경변수 미설정 시 전체 영업 매장 (주의: 매장 수 많음)
        active_stores = [s for s in all_stores if s.get("폐점여부") == "영업"]
        print(f"[batch] 전체 영업 매장: {len(active_stores)}개")

    store_results: list[dict] = []
    success_count = 0
    failed_count = 0
    skipped_count = 0
    cooldown_days = int(os.environ.get("ALERT_COOLDOWN_DAYS", "1"))
    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")

    for store in active_stores:
        store_code = store.get("매장")
        store_name = store.get("매장명", "")
        if store_code is None:
            continue

        try:
            # 1단계: 위험 점수 계산 (LLM 없음, 저비용)
            scored = _score_store(store, date_str)
            if "error" in scored:
                raise Exception(scored["error"])

            # 트리거 게이트 — 어느 source도 발동 안 하면 무발송(대시보드만 기록)
            any_trigger = any(
                sd.get("risk", {}).get("trigger")
                for sd in scored["results"].values()
                if isinstance(sd, dict) and "error" not in sd
            )
            if not any_trigger:
                gate_result = _generate_guide_for(scored, store)  # guide 없이 risk만
                _record_alert(s3_client, gate_result, channel, trigger_type="scored_skip")
                reasons = "; ".join(
                    f"{src}:{sd.get('risk', {}).get('reason', '')}"
                    for src, sd in scored["results"].items() if isinstance(sd, dict)
                )
                store_results.append({
                    "store_code": str(store_code),
                    "store_name": store_name,
                    "status": "scored_skip",
                    "reason": reasons,
                })
                skipped_count += 1
                print(f"[batch] 위험 점수 미달 무발송: {store_name} ({store_code}) — {reasons}")
                continue

            severity = _aggregate_severity(scored)

            # 쿨다운 체크 — high 심각도면 override
            prior_state = alert_state_get(frontend_bucket, store_code)
            skip, reason = should_skip_for_cooldown(
                prior_state, now, cooldown_days, severity
            )
            if skip:
                store_results.append({
                    "store_code": str(store_code),
                    "store_name": store_name,
                    "status": "skipped",
                    "reason": reason,
                    "severity": severity,
                })
                skipped_count += 1
                print(f"[batch] 쿨다운 스킵: {store_name} ({store_code}) — {reason}")
                continue

            # 2단계: 트리거 통과 + 쿨다운 통과 매장만 LLM 가이드 생성 (Bedrock)
            guide_result = _generate_guide_for(scored, store)

            # 수신자 조회: 3계층(매장/부서/팀) 리졸버 — 배치는 매장 전체 범위
            recipients_data = _load_recipients()
            receiver_uuids: list[str] = resolve_recipients(
                recipients_data, store_code
            )
            print(
                f"[batch][audit] store={store_code} count={len(receiver_uuids)} "
                f"channel={channel} severity={severity}"
            )

            if channel == "kakao":
                notifier.send_guide(
                    receiver_uuids, store_name, date_str,
                    str(store_code), guide_result.get("results", {}),
                )
            else:
                subject = f"[다이소 안전가이드] {store_name} - {date_str}"
                msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
                notifier.send(receiver_uuids, subject, msg_body)

            # frontend 버킷에 현황 기록 (trigger_type = "batch")
            _record_alert(
                s3_client, guide_result, channel, trigger_type="batch",
                recipients_data=recipients_data, receiver_uuids=receiver_uuids,
            )

            # 알림 상태 업데이트 (쿨다운/확인 추적용)
            alert_state_record_sent(
                frontend_bucket, store_code, date_str, severity, now
            )

            cust = guide_result.get("results", {}).get("cust", {})
            emp = guide_result.get("results", {}).get("emp", {})

            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": "success",
                "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
                "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
            })
            success_count += 1
            print(f"[batch] 완료: {store_name} ({store_code})")

        except Exception as e:
            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": "failed",
                "error": str(e),
            })
            failed_count += 1
            print(f"[batch] 실패: {store_code} {store_name} — {e}")

    # 배치 전체 결과를 daily 버킷에 저장
    batch_result = {
        "date": date_str,
        "timestamp": timestamp,
        "trigger_type": "batch",
        "channel": channel,
        "summary": {
            "total": len(active_stores),
            "success": success_count,
            "failed": failed_count,
        },
        "stores": store_results,
    }

    if daily_bucket:
        try:
            key = f"daily/{date_str}/results.json"
            s3_client.put_object(
                Bucket=daily_bucket,
                Key=key,
                Body=json.dumps(batch_result, ensure_ascii=False, indent=2).encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
            print(f"[batch] 전체 결과 저장: s3://{daily_bucket}/{key}")
        except Exception as e:
            print(f"[batch] 전체 결과 저장 실패: {e}")

    print(
        f"[batch] 완료 — 총 {len(active_stores)}개 매장, "
        f"성공 {success_count}, 실패 {failed_count}"
    )
    return batch_result
