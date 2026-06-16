#!/usr/bin/env python3
"""
calibrate_theta.py — 발송 이력 + ack 피드백으로 위험 임계값 θ 자가보정  [MVP 축4: 자가보정]

배경
  models/{source}/risk_policy.json 에 학습된 θ_score, θ_high, weights 가 있고,
  batch Lambda 는 매 실행 시 이 파일을 S3 에서 로드해 트리거 판정에 사용한다.
  따라서 risk_policy.json 을 갱신하고 S3 에 업로드하면 다음 배치부터 자동 반영된다.

피드백 소스
  1) S3 alert_state/{store_code}.json  → ack 이력 (ack_status: acknowledged/viewed/pending)
  2) S3 alerts/{date}/index.json (또는 alerts/{date}/{store_code}.json) → 발송 risk_score, store_code

피드백 해석 (proxy label)
  acknowledged                         → 위험 실재 가능성 高 (label=1.0)
  viewed                               → 약한 positive          (label=0.7)
  pending + 발송 후 ACK_WINDOW_DAYS 경과 → 가능한 false alarm    (label=0.0)
  pending + 기간 미달                  → 판정 보류 (샘플 제외)

사용:
  python3 scripts/calibrate_theta.py                      # cust+emp 보정, JSON 갱신
  python3 scripts/calibrate_theta.py --source cust
  python3 scripts/calibrate_theta.py --dry-run            # 산정만, 파일 미갱신
  python3 scripts/calibrate_theta.py --days 30            # 최근 30일 이력 사용 (기본 14)
  python3 scripts/calibrate_theta.py --min-samples 10     # cold-start 하한 (기본 20)
  python3 scripts/calibrate_theta.py --local-alerts alerts_export/  # S3 없을 때 로컬 폴백

환경변수:
  AWS_DEFAULT_REGION
  MODELS_BUCKET  : risk_policy 업로드 대상 (없으면 DAILY_BUCKET 폴백)
  DAILY_BUCKET   : alerts/ 이력 읽기 + MODELS_BUCKET 폴백
  FRONTEND_BUCKET: alert_state/ 읽기
  (S3 버킷 미설정 시 → 로컬 파일만 갱신, S3 단계 graceful skip)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"

# ── 상수 / 설정 ───────────────────────────────────────────────────────
MIN_SAMPLES = 20          # 이 미만이면 보정 거부 (cold start)
DAMPEN = 0.7              # 이전 θ 보존 비율 (급격한 변화 방지)
ACK_WINDOW_DAYS = 7       # 발송 후 이 일수 지나야 pending → negative 인정
BETA = 2.0               # F_beta — recall 중시 (β=2: recall 가중)
MAX_ADJUST_RATIO = 0.25   # 현재 θ 대비 최대 ±25% 조정
SOURCES = ["cust", "emp"]

LABEL_MAP = {"acknowledged": 1.0, "viewed": 0.7}


# ── S3 헬퍼 ───────────────────────────────────────────────────────────
def _s3_client():
    """boto3 클라이언트. 미설치/실패 시 None (graceful)."""
    try:
        import boto3  # noqa
        return boto3.client("s3")
    except Exception as e:
        print(f"  [s3] boto3 사용 불가 → S3 단계 스킵 ({e})")
        return None


def _s3_get_json(s3, bucket: str, key: str):
    """S3 객체 1개 → dict/list. 없거나 실패 시 None."""
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        return None


def fetch_ack_states(bucket: str, store_codes) -> dict:
    """alert_state/{store_code}.json 수집.

    반환: {store_code: {"ack_status", "last_sent_at", "ack_history", ...}}
    boto3 없거나 S3 접근 실패 시 {} 반환 (graceful degrade).
    """
    if not bucket:
        return {}
    s3 = _s3_client()
    if s3 is None:
        return {}
    out: dict = {}
    for code in store_codes:
        code = str(code).strip()
        st = _s3_get_json(s3, bucket, f"alert_state/{code}.json")
        if isinstance(st, dict):
            out[code] = st
    return out


def _extract_score(record: dict) -> float | None:
    """발송 레코드에서 display_score(0~1) 추출. 여러 스키마 관용 처리."""
    if not isinstance(record, dict):
        return None
    # 직접 필드
    for k in ("display_score", "risk_score", "score"):
        v = record.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    # results.{source}.risk.display_score 중 최댓값
    best = None
    results = record.get("results") or {}
    if isinstance(results, dict):
        for data in results.values():
            risk = (data or {}).get("risk", {}) if isinstance(data, dict) else {}
            for k in ("display_score", "risk_score", "score"):
                v = risk.get(k)
                if isinstance(v, (int, float)):
                    best = v if best is None else max(best, v)
                    break
    return float(best) if best is not None else None


def _iter_records(blob):
    """index.json / 단일 레코드 / list 형태를 레코드 iterator 로 정규화."""
    if isinstance(blob, list):
        yield from (r for r in blob if isinstance(r, dict))
    elif isinstance(blob, dict):
        for key in ("items", "results", "alerts"):
            inner = blob.get(key)
            if isinstance(inner, list):
                yield from (r for r in inner if isinstance(r, dict))
                return
        # index 가 단일 발송 레코드 그 자체인 경우
        if "store_code" in blob:
            yield blob


def fetch_alert_history(bucket: str, dates) -> list:
    """alerts/{date}/index.json 에서 store_code, risk_score(display_score), date 수집.

    index.json 이 없으면 alerts/{date}/ 의 개별 레코드 형태는 다루지 않는다
    (index 가 표준 집계 파일). 반환: [{"store_code", "date", "risk_score"}, ...]
    """
    if not bucket:
        return []
    s3 = _s3_client()
    if s3 is None:
        return []
    out: list = []
    for d in dates:
        blob = _s3_get_json(s3, bucket, f"alerts/{d}/index.json")
        if blob is None:
            continue
        for rec in _iter_records(blob):
            sc = _extract_score(rec)
            code = rec.get("store_code")
            if sc is None or code is None:
                continue
            out.append({"store_code": str(code).strip(),
                        "date": str(rec.get("date", d)), "risk_score": sc})
    return out


def fetch_alert_history_local(local_dir: str, dates) -> list:
    """로컬 폴백: {local_dir}/{date}/index.json 또는 {local_dir}/{date}.json."""
    base = Path(local_dir)
    if not base.is_absolute():
        base = (Path.cwd() / base)
    out: list = []
    if not base.exists():
        print(f"  [local] 경로 없음: {base}")
        return out
    cand_paths = []
    for d in dates:
        cand_paths += [base / d / "index.json", base / f"{d}.json"]
    # 날짜 필터 없이 디렉터리 전체도 허용 (export 덤프)
    for p in list(base.rglob("index.json")) + list(base.glob("*.json")):
        if p not in cand_paths:
            cand_paths.append(p)
    seen = set()
    for p in cand_paths:
        if p in seen or not p.exists():
            continue
        seen.add(p)
        try:
            blob = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        # 파일명/상위폴더에서 날짜 추론
        d_guess = p.parent.name if p.name == "index.json" else p.stem
        for rec in _iter_records(blob):
            sc = _extract_score(rec)
            code = rec.get("store_code")
            if sc is None or code is None:
                continue
            out.append({"store_code": str(code).strip(),
                        "date": str(rec.get("date", d_guess)), "risk_score": sc})
    return out


# ── 피드백 데이터셋 ───────────────────────────────────────────────────
def build_feedback_dataset(alert_history: list, ack_states: dict,
                           today_str: str, ack_window_days: int) -> list:
    """각 alert 에 proxy label 부여. label=None 인 샘플은 제외.

      label = 1.0   ack_status == "acknowledged"
      label = 0.7   ack_status == "viewed"
      label = 0.0   ack_status == "pending" AND (today - alert_date).days >= ack_window_days
      label = None  pending 이지만 기간 미달 → 보류 (샘플에서 제외)
    """
    today = datetime.strptime(today_str, "%Y-%m-%d").date()
    samples: list = []
    for a in alert_history:
        code = a["store_code"]
        st = ack_states.get(code, {})
        status = (st.get("ack_status") or "pending").strip().lower()

        label = LABEL_MAP.get(status)
        if label is None:
            # pending (또는 미상) — 경과일 판단
            try:
                a_date = datetime.strptime(a["date"][:10], "%Y-%m-%d").date()
            except Exception:
                continue
            elapsed = (today - a_date).days
            if elapsed >= ack_window_days:
                label = 0.0          # 충분히 지났는데 무반응 → false-alarm proxy
            else:
                continue             # too recent → 판정 보류

        samples.append({"store_code": code, "risk_score": float(a["risk_score"]),
                        "label": float(label), "date": a["date"]})
    return samples


# ── θ 탐색 ────────────────────────────────────────────────────────────
def _prf(predicted: list, actual: list, beta: float) -> tuple:
    tp = sum(1 for p, y in zip(predicted, actual) if p == 1 and y == 1)
    fp = sum(1 for p, y in zip(predicted, actual) if p == 1 and y == 0)
    fn = sum(1 for p, y in zip(predicted, actual) if p == 0 and y == 1)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    b2 = beta * beta
    denom = (b2 * precision) + recall
    f_beta = (1 + b2) * precision * recall / denom if denom else 0.0
    return precision, recall, f_beta


def find_optimal_theta(samples: list, current_theta: float, beta: float = BETA) -> dict:
    """risk_score 분포에서 0.05 단위 grid search → F_beta 최대 θ.

    주의: 발송 레코드의 risk_score 는 display_score(0~1) 인 반면 current_theta 는
    raw logistic 스케일이다. 따라서 후보 θ 는 0~1 그리드에서 찾되,
    클램프는 raw current_theta 대비 ±MAX_ADJUST_RATIO 비율로 적용한다.
    optimal_theta_raw = current_theta * (optimal_display / display_pivot) 보정 없이,
    optimal_display 자체를 비율로 환산해 raw 스케일에 사상한다.
    """
    actual = [1 if s["label"] >= 0.5 else 0 for s in samples]
    n_pos = sum(actual)

    # 0~1 display 스케일 그리드
    grid = [round(0.05 * i, 2) for i in range(0, 21)]
    best = {"theta_display": None, "precision": 0.0, "recall": 0.0, "f_beta": -1.0}
    for t in grid:
        predicted = [1 if s["risk_score"] >= t else 0 for s in samples]
        p, r, fb = _prf(predicted, actual, beta)
        if fb > best["f_beta"]:
            best = {"theta_display": t, "precision": p, "recall": r, "f_beta": fb}

    # display θ → raw θ 사상.
    # 발송 레코드는 모두 display_score 기준이므로, 최적 display θ 가
    # 현재 운영 display θ(= current raw / theta_high≈1 정규화 기준)에서 얼마나
    # 벗어났는지를 raw current_theta 에 비례 적용한다.
    # display 중앙값(=현 운영점 근사)을 pivot 으로 사용.
    scores = sorted(s["risk_score"] for s in samples)
    pivot = scores[len(scores) // 2] if scores else 0.5
    pivot = pivot if pivot > 0 else 0.5
    ratio = (best["theta_display"] / pivot) if best["theta_display"] is not None else 1.0
    optimal_raw = current_theta * ratio

    # 클램프: current_theta 대비 ±MAX_ADJUST_RATIO
    lo = current_theta * (1.0 - MAX_ADJUST_RATIO)
    hi = current_theta * (1.0 + MAX_ADJUST_RATIO)
    clamped = max(lo, min(hi, optimal_raw))

    return {
        "optimal_theta": round(optimal_raw, 4),
        "optimal_theta_display": best["theta_display"],
        "clamped_theta": round(clamped, 4),
        "precision": round(best["precision"], 4),
        "recall": round(best["recall"], 4),
        "f_beta": round(best["f_beta"], 4),
        "n_samples": len(samples),
        "n_positive": n_pos,
    }


def dampen_theta(old_theta: float, new_theta: float, dampen: float = DAMPEN) -> float:
    """new_θ = dampen·old_θ + (1-dampen)·new_θ — 급격한 변화 방지."""
    return round(dampen * old_theta + (1.0 - dampen) * new_theta, 4)


# ── policy I/O ────────────────────────────────────────────────────────
def _load_policy(source: str) -> dict | None:
    path = MODELS_DIR / source / "risk_policy.json"
    if not path.exists():
        print(f"  [error] {path} 없음")
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _save_policy(source: str, policy: dict) -> None:
    path = MODELS_DIR / source / "risk_policy.json"
    path.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  ✓ risk_policy.json 갱신: {path}")


def _upload_policy(bucket: str, source: str, policy_dict: dict) -> None:
    s3 = _s3_client()
    if s3 is None:
        return
    key = f"models/{source}/risk_policy.json"
    try:
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(policy_dict, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"  ✓ S3 업로드: s3://{bucket}/{key}")
    except Exception as e:
        print(f"  [s3] 업로드 실패 → 스킵 ({e})")


# ── 보정 본체 ─────────────────────────────────────────────────────────
def calibrate(source: str, dry_run: bool, days: int, min_samples: int,
              local_alerts_dir: str | None) -> dict:
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    bar = "=" * 30
    print(f"\n{bar}\n  [{source.upper()}] θ 자가보정\n{bar}")

    policy = _load_policy(source)
    if policy is None:
        return {"source": source, "status": "no_policy"}

    current_theta = float(policy.get("theta_score", 0.0))
    current_high = float(policy.get("theta_high", current_theta))

    dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]

    models_bucket = os.environ.get("MODELS_BUCKET") or os.environ.get("DAILY_BUCKET", "")
    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")

    # 1) alert history (S3 → local 폴백)
    history = fetch_alert_history(daily_bucket, dates)
    if not history and local_alerts_dir:
        history = fetch_alert_history_local(local_alerts_dir, dates)

    # 2) ack states
    store_codes = sorted({h["store_code"] for h in history})
    ack_states = fetch_ack_states(frontend_bucket, store_codes)

    # 3) feedback dataset
    samples = build_feedback_dataset(history, ack_states, today_str, ACK_WINDOW_DAYS)
    n_pos = sum(1 for s in samples if s["label"] >= 0.5)
    n_neg = len(samples) - n_pos

    print(f"  이력 수집: {days}일 / alerts {len(history)}건 / ack 상태 {len(ack_states)}매장")
    print(f"  피드백 샘플: {len(samples)}건 (positive {n_pos} / negative {n_neg})")

    # 6) cold start 가드
    if len(samples) < min_samples:
        print(f"\n  [COLD START] {source}: 샘플 {len(samples)}건 < min_samples({min_samples}) → 보정 거부")
        return {"source": source, "status": "cold_start",
                "n_samples": len(samples), "min_samples": min_samples,
                "theta_score": current_theta}

    # 7) optimal θ
    opt = find_optimal_theta(samples, current_theta, beta=BETA)
    # 8) dampen
    dampened = dampen_theta(current_theta, opt["clamped_theta"], DAMPEN)

    print(f"  현재 θ_score: {current_theta:.4f}")
    print(f"  최적 θ (raw): {opt['clamped_theta']:.4f}  "
          f"(precision={opt['precision']:.2f}, recall={opt['recall']:.2f}, F{BETA:g}={opt['f_beta']:.2f})")
    print(f"  dampened θ: {dampened:.4f}  ({DAMPEN}×old + {round(1-DAMPEN,2)}×optimal)")

    # 9) theta_high 비례 조정 (하향 방지: 기존보다 작아지지 않도록)
    new_high = round(max(dampened * 1.15, current_high), 4)
    if abs(new_high - current_high) < 1e-9:
        print(f"  θ_high: {current_high:.4f} → {new_high:.4f} (조정 없음)")
    else:
        print(f"  θ_high: {current_high:.4f} → {new_high:.4f}")

    report = {
        "source": source, "status": "calibrated",
        "old_theta": current_theta, "new_theta": dampened,
        "old_theta_high": current_high, "new_theta_high": new_high,
        "n_samples": len(samples), "n_positive": n_pos, "n_negative": n_neg,
        "precision": opt["precision"], "recall": opt["recall"], "f_beta": opt["f_beta"],
        "dry_run": dry_run,
    }

    if dry_run:
        print("  [dry-run] 파일·S3 미갱신 (분석 결과만 출력)")
        return report

    # 9) policy 갱신 — 기존 필드 보존
    policy["theta_score"] = dampened
    policy["theta_high"] = new_high
    policy["version"] = f"calibrated-{today_str}"

    hist = policy.get("calibration_history")
    if not isinstance(hist, list):
        hist = []
    hist.append({
        "date": today_str,
        "old_theta": current_theta,
        "new_theta": dampened,
        "old_theta_high": current_high,
        "new_theta_high": new_high,
        "n_samples": len(samples),
        "n_positive": n_pos,
        "f_beta": opt["f_beta"],
    })
    policy["calibration_history"] = hist[-20:]   # 최대 20개, 오래된 것부터 제거

    # 10) 로컬 저장 + S3 업로드
    _save_policy(source, policy)
    if models_bucket:
        _upload_policy(models_bucket, source, policy)
    else:
        print("  [s3] MODELS_BUCKET/DAILY_BUCKET 미설정 → S3 업로드 스킵 (로컬만 갱신)")

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="θ 자가보정 (ack 피드백 → risk_policy.json)")
    ap.add_argument("--source", choices=SOURCES + ["both"], default="both")
    ap.add_argument("--dry-run", action="store_true", help="산정만, 파일 미갱신")
    ap.add_argument("--days", type=int, default=14, help="최근 N일 이력 사용 (기본 14)")
    ap.add_argument("--min-samples", type=int, default=MIN_SAMPLES,
                    help=f"cold-start 하한 (기본 {MIN_SAMPLES})")
    ap.add_argument("--local-alerts", default="", help="S3 없을 때 로컬 alerts export 경로")
    a = ap.parse_args()

    sources = SOURCES if a.source == "both" else [a.source]
    local_dir = a.local_alerts or None

    reports = []
    for src in sources:
        reports.append(calibrate(src, a.dry_run, a.days, a.min_samples, local_dir))

    # 요약
    print(f"\n{'─' * 30}\n  요약")
    for r in reports:
        st = r.get("status")
        if st == "calibrated":
            print(f"  {r['source']}: {r['old_theta']:.4f} → {r['new_theta']:.4f} "
                  f"(n={r['n_samples']}, F{BETA:g}={r['f_beta']:.2f})"
                  + ("  [dry-run]" if r.get("dry_run") else ""))
        elif st == "cold_start":
            print(f"  {r['source']}: 보정 거부 (샘플 {r['n_samples']} < {r['min_samples']})")
        else:
            print(f"  {r['source']}: {st}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
