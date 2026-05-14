"""
rule_enrichment.py - 의사결정트리 규칙 고도화 모듈

트리에서 추출한 순수 수치 분기 규칙에 도메인 지식을 결합하여:
1. 각 조건에 위험 시나리오 라벨 부여
2. 복합 조건의 위험 등급 산정
3. 리프 노드별 핵심 위험 요인 설명 생성

이를 통해 rule_matcher.py가 리프를 매칭한 후,
LLM 프롬프트에 "왜 이 리프가 위험한지"를 설명할 수 있다.
"""

from __future__ import annotations
import copy
from typing import Any


# ──────────────────────────────────────────────
# 1. 변수별 임계값 & 위험 해석 사전
# ──────────────────────────────────────────────

FEATURE_RISK_THRESHOLDS = {
    # ── 기상 피처 ──
    "temperature_2m_min": {
        "극한파": {"op": "<=", "val": -5.0, "risk": "극심한 결빙, 입구·주차장·외부 보행면 전면 결빙"},
        "한파": {"op": "<=", "val": 0.0, "risk": "결빙 위험, 입구·주차장 낙상 급증"},
        "쌀쌀": {"op": "<=", "val": 5.0, "risk": "새벽·야간 결빙 가능, 출퇴근 시간 주의"},
        "온화": {"op": "<=", "val": 11.0, "risk": "일반 수준, 특이 위험 낮음"},
        "온난": {"op": ">", "val": 11.0, "risk": "결빙 위험 없음, 여름철 온열질환 주의 시작"},
    },
    "temperature_2m_max": {
        "한파지속": {"op": "<=", "val": 8.0, "risk": "낮에도 영상 한자릿수, 종일 결빙 해소 안됨"},
        "서늘": {"op": "<=", "val": 17.0, "risk": "봄가을 수준, 환절기 체력 저하 주의"},
        "적정": {"op": "<=", "val": 24.0, "risk": "쾌적 온도, 특이 위험 낮음"},
        "더움": {"op": "<=", "val": 29.0, "risk": "고온 시작, 창고·야외 작업 시 탈진 주의"},
        "폭염": {"op": ">", "val": 29.0, "risk": "온열질환·탈진 위험, 야외 작업 제한 필요"},
    },
    "precipitation_sum": {
        "맑음": {"op": "<=", "val": 0.0, "risk": "강수 없음"},
        "약한비": {"op": "<=", "val": 3.0, "risk": "가벼운 비, 입구 물기 주의"},
        "보통비": {"op": "<=", "val": 10.0, "risk": "바닥 물기·우산 물기로 미끄러짐 위험"},
        "많은비": {"op": ">", "val": 10.0, "risk": "입구 혼잡+바닥 침수, 낙상·충돌 위험 급증"},
    },
    "snowfall_sum": {
        "무설": {"op": "<=", "val": 0.0, "risk": "적설 없음"},
        "소설": {"op": "<=", "val": 3.0, "risk": "가벼운 눈, 입구·주차장 미끄럼 주의"},
        "대설": {"op": ">", "val": 3.0, "risk": "제설 작업 필요, 낙설·미끄럼·중량물 사고 위험"},
    },
    "rain_sum": {
        "무강우": {"op": "<=", "val": 0.0, "risk": "비 없음"},
        "약한비": {"op": "<=", "val": 6.0, "risk": "가벼운 비, 입구 물기 주의"},
        "보통비": {"op": "<=", "val": 10.0, "risk": "바닥 물기·우산 물기로 미끄러짐 위험"},
        "많은비": {"op": ">", "val": 10.0, "risk": "폭우, 입구 침수·혼잡으로 낙상·충돌 위험 급증"},
    },
    "wind_speed_10m_max": {
        "미풍": {"op": "<=", "val": 2.0, "risk": "바람 거의 없음, 풍압 사고 위험 낮음"},
        "약풍": {"op": "<=", "val": 4.0, "risk": "약한 바람, 경량 적재물 주의"},
        "중풍": {"op": "<=", "val": 6.0, "risk": "간판·현수막 흔들림, 출입문 급개폐 주의"},
        "강풍": {"op": "<=", "val": 10.0, "risk": "적재물 전도, 간판 낙하, 출입문 사고 위험"},
        "폭풍": {"op": ">", "val": 10.0, "risk": "외부 작업 중단 권고, 간판·구조물 낙하 위험"},
    },
    "relative_humidity_2m_mean": {
        "건조": {"op": "<=", "val": 30.0, "risk": "정전기 발생, 건조 피부 자상 위험"},
        "적정": {"op": "<=", "val": 60.0, "risk": "쾌적 습도, 특이 위험 낮음"},
        "다습": {"op": "<=", "val": 76.0, "risk": "바닥 결로 시작, 미끄러짐 주의"},
        "고습": {"op": "<=", "val": 80.0, "risk": "결로·미끄러짐 위험 증가"},
        "극습": {"op": ">", "val": 80.0, "risk": "전면 결로, 바닥·계단 미끄러짐 위험 급증"},
    },
    "soil_temperature_0_to_7cm_mean": {
        "지표결빙": {"op": "<=", "val": 0.0, "risk": "지표면 결빙, 외부 보행면 낙상 위험"},
        "동절기": {"op": "<=", "val": 18.0, "risk": "겨울~초봄, 새벽 결빙 가능"},
        "춘추": {"op": "<=", "val": 26.55, "risk": "봄가을 수준, 일반 위험"},
        "하절기": {"op": "<=", "val": 30.75, "risk": "여름철, 온열질환·식품 변질 주의"},
        "폭염기": {"op": ">", "val": 30.75, "risk": "극심한 더위, 야외·창고 작업 온열질환 위험"},
    },
    # ── 매장 수치 피처 ──
    "평수": {
        "소형": {"op": "<=", "val": 200.0, "risk": "좁은 통로, 고객·직원 충돌 위험"},
        "중형": {"op": "<=", "val": 300.0, "risk": "일반 규모, 동선 관리 필요"},
        "대형": {"op": "<=", "val": 400.0, "risk": "넓은 동선, 이동 중 사고 빈도 증가"},
        "초대형": {"op": ">", "val": 400.0, "risk": "매우 넓은 매장, 사각지대·장거리 이동 사고"},
    },
    "창고": {
        "소규모": {"op": "<=", "val": 5.0, "risk": "소형 창고, 적재 밀도 높아 낙하물 위험"},
        "중규모": {"op": "<=", "val": 14.5, "risk": "일반 창고, 적재물 이동 주의"},
        "대규모": {"op": "<=", "val": 35.0, "risk": "대형 창고, 지게차·적재물 충돌 위험 증가"},
        "초대규모": {"op": ">", "val": 35.0, "risk": "초대형 창고, 복잡 동선+중장비 사고 위험"},
    },
    "계약면적(㎡)": {
        "소형": {"op": "<=", "val": 772.0, "risk": "소형 매장, 밀집도 높아 충돌 위험"},
        "중형": {"op": "<=", "val": 1000.0, "risk": "중형 매장, 일반 수준"},
        "대형": {"op": "<=", "val": 1329.0, "risk": "대형 매장, 동선 길어 이동 사고 증가"},
        "초대형": {"op": ">", "val": 1329.0, "risk": "초대형 매장, 관리 사각지대 발생"},
    },
    "매장인원": {
        "극소": {"op": "<=", "val": 5.0, "risk": "인원 부족, 1인 작업·과로 사고 위험"},
        "소": {"op": "<=", "val": 10.0, "risk": "소규모 인원, 고강도 작업 빈도 높음"},
        "중": {"op": "<=", "val": 15.0, "risk": "적정 인원, 작업 혼잡 주의"},
        "대": {"op": ">", "val": 15.0, "risk": "다인원, 작업 동선 혼잡·충돌 위험"},
    },
    "입고도우미PO": {
        "없음": {"op": "<=", "val": 0.5, "risk": "도우미 없음, 직원 직접 입고 → 과부하"},
        "소수": {"op": "<=", "val": 1.0, "risk": "최소 인원, 입고 작업 강도 높음"},
        "다수": {"op": ">", "val": 1.0, "risk": "다수 도우미, 입고 작업량 많음 → 적재 사고 위험"},
    },
    "일평균매출": {
        "저매출": {"op": "<=", "val": 7500000.0, "risk": "저매출 매장, 고객 밀집도 낮음"},
        "중매출": {"op": "<=", "val": 12000000.0, "risk": "중간 매출, 일반 혼잡도"},
        "고매출": {"op": "<=", "val": 15000000.0, "risk": "고매출, 고객 밀집·혼잡 증가"},
        "초고매출": {"op": ">", "val": 15000000.0, "risk": "초고매출, 극심한 혼잡 → 충돌·낙상 급증"},
    },
    "일평균물동량": {
        "저물동": {"op": "<=", "val": 175.0, "risk": "물동량 적음, 입고 작업 부담 낮음"},
        "중물동": {"op": "<=", "val": 325.0, "risk": "중간 물동량, 일반 입고 작업"},
        "고물동": {"op": ">", "val": 325.0, "risk": "고물동량, 입고·진열 강도 높아 근골격계 사고 위험"},
    },
}


# ──────────────────────────────────────────────
# 1-1. 고객/직원별 룰 기준
# ──────────────────────────────────────────────
#
# 기준 구간은 Decision Tree 산출물의 주요 분기 피처와 기존 임계값을 함께 사용한다.
# risk 문구는 leaf_table의 대표 사례를 참고해 고객 사고(cust)와 직원 사고(emp)의
# 실제 행동/상황 차이가 드러나도록 분리한다.

_CUST_RISK_OVERRIDES = {
    "precipitation_sum": {
        "약한비": "고객 우산 동선과 입구 물기로 출입구 미끄러짐 위험",
        "보통비": "고객이 셀프계산대·입구로 이동 중 젖은 바닥에 미끄러질 위험",
        "많은비": "고객 출입구 혼잡과 바닥 물기로 낙상·충돌 위험 급증",
    },
    "rain_sum": {
        "약한비": "고객 우산 물기 유입으로 매장 입구 미끄러짐 위험",
        "보통비": "고객 이동 동선의 물기와 매트 걸림으로 낙상 위험",
        "많은비": "고객 출입 집중 구간의 물기·혼잡으로 낙상 위험 급증",
    },
    "snowfall_sum": {
        "소설": "고객 입구·계단·외부 보행면 미끄러짐 위험",
        "대설": "고객 주차장·출입구 결빙 및 낙설·미끄러짐 위험",
    },
    "wind_speed_10m_max": {
        "중풍": "고객 출입문 급개폐와 외부 적재물 흔들림 주의",
        "강풍": "고객 출입구 주변 간판·적재물 전도 및 출입문 충돌 위험",
        "폭풍": "고객 외부 보행과 출입구 접근 중 구조물 낙하 위험",
    },
    "temperature_2m_min": {
        "극한파": "고객 출입구·계단·외부 보행면 결빙 낙상 위험 매우 높음",
        "한파": "고객 매장 입구와 외부 보행면 결빙 낙상 위험",
        "쌀쌀": "고객 새벽·야간 입구 매트 및 계단 미끄러짐 주의",
    },
    "temperature_2m_max": {
        "한파지속": "고객 외부 보행면 결빙이 낮에도 유지될 수 있음",
        "폭염": "고객 대기·쇼핑 중 탈진 및 어지럼으로 인한 전도 주의",
    },
    "soil_temperature_0_to_7cm_mean": {
        "지표결빙": "고객 주차장·입구·외부 데크 결빙 낙상 위험",
        "동절기": "고객 외부 보행면과 입구 매트 미끄러짐 주의",
        "폭염기": "고객 외부 대기와 이동 중 온열 부담 증가",
    },
    "평수": {
        "소형": "고객 통로가 좁아 상품박스·진열대 접촉 및 충돌 위험",
        "대형": "고객 이동 동선이 길어 계단·코너·매대 주변 낙상 위험",
        "초대형": "고객 이동 사각지대와 장거리 동선에서 낙상·충돌 위험",
    },
    "실평수": {
        "소형": "고객 유효 보행 공간이 좁아 매대·차단봉·박스 접촉 위험",
        "대형": "고객 이동 범위가 넓어 계단·코너 사고 관찰 필요",
        "초대형": "고객 동선 분산으로 사각지대 낙상 발견 지연 위험",
    },
    "진열평수": {
        "대형": "고객 진열대 접촉·상품 낙하·모서리 충돌 위험 증가",
        "초대형": "고객 진열 동선이 길고 사각지대가 늘어 사고 발견 지연 위험",
    },
    "창고": {
        "소규모": "고객 동선 주변 임시 적재가 늘면 박스 걸림·충돌 위험",
        "대규모": "입고·진열 중 고객 통로 점유와 적재물 접촉 위험",
        "초대규모": "대량 입고·적재 이동으로 고객 통로 충돌 위험 증가",
    },
    "계약면적(㎡)": {
        "소형": "고객 밀집과 좁은 동선으로 차단봉·매대 접촉 위험",
        "대형": "고객 이동 구간이 길어 계단·코너·외부 연결부 낙상 위험",
        "초대형": "고객 사각지대와 장거리 동선에서 낙상·충돌 위험",
    },
    "매장인원": {
        "극소": "고객 동선 정리와 물기 제거 대응이 지연될 위험",
        "소": "고객 혼잡·적재물 방치에 대한 현장 대응 여력 부족",
        "대": "직원 작업 동선과 고객 동선이 겹쳐 충돌 위험",
    },
    "입고도우미PO": {
        "없음": "입고 정리가 지연되어 고객 통로 박스 걸림 위험",
        "다수": "입고 작업량이 많아 고객 통로 점유·충돌 위험",
    },
    "일평균매출": {
        "고매출": "고객 밀집으로 출입구·계산대·코너 충돌 및 낙상 위험",
        "초고매출": "고객 혼잡이 커져 차단봉·매트·박스 걸림 사고 위험 급증",
    },
    "일평균물동량": {
        "고물동": "입고·진열 물량 증가로 고객 통로 적재물 걸림 위험",
    },
}

_EMP_RISK_OVERRIDES = {
    "precipitation_sum": {
        "약한비": "직원 매트 교체·물기 제거 중 미끄러짐 위험",
        "보통비": "직원 입구 정리와 외부 이동 작업 중 미끄러짐 위험",
        "많은비": "직원 제수·매트 교체·외부 정리 작업 중 낙상 위험 급증",
    },
    "rain_sum": {
        "약한비": "직원 물기 제거와 우산 정리 작업 중 미끄러짐 주의",
        "보통비": "직원 입구·계단·외부 보행면 정리 작업 중 낙상 위험",
        "많은비": "직원 외부 정리와 물기 대응 작업 중 낙상·무리한 동작 위험",
    },
    "snowfall_sum": {
        "소설": "직원 제설·매트 교체 중 미끄러짐과 허리 부담 위험",
        "대설": "직원 제설·외부 정리·중량물 이동 중 낙상 및 근골격계 위험",
    },
    "wind_speed_10m_max": {
        "중풍": "직원 외부 적재물·출입문 점검 중 손 끼임·부딪힘 주의",
        "강풍": "직원 간판·집기 고정과 외부 정리 중 전도·낙하물 위험",
        "폭풍": "직원 외부 작업 제한 필요, 구조물·적재물 낙하 위험",
    },
    "temperature_2m_min": {
        "극한파": "직원 출근·입고·외부 정리 중 결빙 낙상 위험 매우 높음",
        "한파": "직원 창고·입구 이동 및 외부 작업 중 결빙 낙상 위험",
        "쌀쌀": "직원 계단 이동과 입고 작업 중 발 헛디딤 주의",
    },
    "temperature_2m_max": {
        "한파지속": "직원 저온 환경 입고·정리 작업 중 근육 긴장과 낙상 위험",
        "폭염": "직원 창고·야외 정리 작업 중 온열질환과 탈진 위험",
    },
    "soil_temperature_0_to_7cm_mean": {
        "지표결빙": "직원 외부 보행·입고 동선 결빙으로 낙상 위험",
        "동절기": "직원 계단·입구·창고 이동 중 발 헛디딤 주의",
        "폭염기": "직원 창고·외부 작업 중 온열 부담과 피로 증가",
    },
    "평수": {
        "소형": "직원 작업 공간이 좁아 상품 운반 중 부딪힘·끼임 위험",
        "대형": "직원 장거리 이동과 반복 운반으로 무리한 동작 위험",
        "초대형": "직원 창고·매장 간 이동량 증가로 피로와 넘어짐 위험",
    },
    "실평수": {
        "소형": "직원 유효 작업 공간 부족으로 박스 운반 중 충돌 위험",
        "대형": "직원 반복 이동과 상품 보충 작업 부담 증가",
        "초대형": "직원 장거리 이동과 사각지대 작업 중 사고 발견 지연 위험",
    },
    "진열평수": {
        "대형": "직원 상품 보충·진열 중 어깨·허리 부담 증가",
        "초대형": "직원 반복 진열과 이동 작업으로 무리한 동작 위험 증가",
    },
    "창고": {
        "소규모": "직원 좁은 창고에서 적재물 낙하·끼임 위험",
        "대규모": "직원 창고 이동·적재·롤테이너 작업 중 부딪힘 위험",
        "초대규모": "직원 대형 창고 작업에서 낙하물·충돌·중량물 위험 증가",
    },
    "계약면적(㎡)": {
        "소형": "직원 좁은 동선에서 상품 운반 중 부딪힘·넘어짐 위험",
        "대형": "직원 넓은 작업 구역 이동과 반복 운반 부담 증가",
        "초대형": "직원 장거리 이동·창고 작업·사각지대 사고 위험",
    },
    "매장인원": {
        "극소": "직원 1인 작업과 중량물 단독 운반 위험",
        "소": "직원 입고·진열 작업 부담이 커져 무리한 동작 위험",
        "대": "직원 간 작업 동선 혼잡으로 부딪힘·끼임 위험",
    },
    "입고도우미PO": {
        "없음": "직원 직접 입고 부담으로 허리·손목 부상 위험",
        "소수": "직원 입고 보조가 부족해 중량물 운반 부담 증가",
        "다수": "입고 작업량이 많아 롤테이너·박스 충돌 및 낙하 위험",
    },
    "일평균매출": {
        "고매출": "직원 고객 대응과 진열 보충이 겹쳐 피로·충돌 위험",
        "초고매출": "직원 고강도 보충·정리 작업으로 무리한 동작 위험 급증",
    },
    "일평균물동량": {
        "고물동": "직원 입고·진열 작업 강도가 높아 중량물·근골격계 사고 위험",
    },
}


def _build_source_thresholds(overrides: dict[str, dict[str, str]]) -> dict:
    thresholds = copy.deepcopy(FEATURE_RISK_THRESHOLDS)
    for feature, label_map in overrides.items():
        feature_rules = thresholds.get(feature)
        if not feature_rules:
            continue
        for label, risk in label_map.items():
            if label in feature_rules:
                feature_rules[label]["risk"] = risk
    return thresholds


SOURCE_FEATURE_RISK_THRESHOLDS = {
    "cust": _build_source_thresholds(_CUST_RISK_OVERRIDES),
    "emp": _build_source_thresholds(_EMP_RISK_OVERRIDES),
}


def get_feature_thresholds(source: str | None = None) -> dict:
    """source별 룰 기준표를 반환한다. source가 없으면 공통 기준표를 반환."""
    if source in SOURCE_FEATURE_RISK_THRESHOLDS:
        return SOURCE_FEATURE_RISK_THRESHOLDS[source]
    return FEATURE_RISK_THRESHOLDS


def classify_feature_bucket(
    source: str | None,
    feature: str,
    value: Any,
) -> dict | None:
    """피처 값을 source별 기준표의 구간 라벨로 분류한다."""
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    thresholds = get_feature_thresholds(source).get(feature)
    if not thresholds:
        return None

    for label, info in thresholds.items():
        op = info["op"]
        threshold = float(info["val"])
        if (
            (op == "<=" and numeric <= threshold)
            or (op == "<" and numeric < threshold)
            or (op == ">" and numeric > threshold)
            or (op == ">=" and numeric >= threshold)
        ):
            return {
                "feature": feature,
                "label": label,
                "value": numeric,
                "op": op,
                "threshold": threshold,
                "risk": info["risk"],
            }

    return None


# ──────────────────────────────────────────────
# 2. 조건 해석 함수
# ──────────────────────────────────────────────

def interpret_condition(
    feature: str,
    op: str,
    threshold: float,
    source: str | None = None,
) -> dict:
    """단일 조건을 도메인 지식으로 해석한다.

    Returns:
        {
            "feature": str,
            "op": str,
            "threshold": float,
            "label": str,       # 예: "한파", "대형"
            "risk_desc": str,   # 위험 설명
            "severity": str,    # "높음"/"중간"/"낮음"
        }
    """
    thresholds = get_feature_thresholds(source).get(feature)
    if not thresholds:
        return {
            "feature": feature,
            "op": op,
            "threshold": threshold,
            "label": f"{feature} {op} {threshold}",
            "risk_desc": "도메인 정보 없음",
            "severity": "중간",
        }

    # 조건에 가장 부합하는 라벨 찾기
    best_label = None
    best_risk = ""

    for label, info in thresholds.items():
        t_op = info["op"]
        t_val = info["val"]

        # 트리 조건과 임계값 사전의 매칭 로직
        if op in ("<=", "<"):
            # 트리가 "feature <= X"이면, X 이하 구간 중 가장 가까운 라벨
            if t_op in ("<=", "<") and threshold <= t_val:
                if best_label is None:
                    best_label = label
                    best_risk = info["risk"]
            elif t_op in ("<=", "<") and threshold > t_val:
                best_label = label
                best_risk = info["risk"]
        elif op in (">", ">="):
            # 트리가 "feature > X"이면, X 초과 구간의 라벨
            if t_op in (">", ">=") and threshold >= t_val:
                best_label = label
                best_risk = info["risk"]
            elif t_op in ("<=", "<") and threshold >= t_val:
                best_label = label
                best_risk = info["risk"]

    if not best_label:
        # fallback: 첫 번째 라벨 사용
        first_label = list(thresholds.keys())[0]
        best_label = first_label
        best_risk = thresholds[first_label]["risk"]

    # 심각도 판정
    severity = _assess_severity(feature, op, threshold)

    return {
        "feature": feature,
        "op": op,
        "threshold": threshold,
        "label": best_label,
        "risk_desc": best_risk,
        "severity": severity,
    }


def _assess_severity(feature: str, op: str, threshold: float) -> str:
    """조건의 심각도를 판정한다."""
    # 기상 위험 심각도 규칙
    severity_rules = {
        "temperature_2m_min": lambda o, t: "높음" if (o in ("<=", "<") and t <= 0) else ("중간" if t <= 5 else "낮음"),
        "temperature_2m_max": lambda o, t: "높음" if (o in (">", ">=") and t >= 29) else ("높음" if (o in ("<=", "<") and t <= 8) else "중간"),
        "precipitation_sum": lambda o, t: "높음" if (o in (">", ">=") and t >= 10) else ("중간" if t >= 3 else "낮음"),
        "rain_sum": lambda o, t: "높음" if (o in (">", ">=") and t >= 10) else ("중간" if t >= 6 else "낮음"),
        "snowfall_sum": lambda o, t: "높음" if (o in (">", ">=") and t > 0) else "낮음",
        "wind_speed_10m_max": lambda o, t: "높음" if (o in (">", ">=") and t >= 6) else ("중간" if t >= 4 else "낮음"),
        "relative_humidity_2m_mean": lambda o, t: "높음" if (o in (">", ">=") and t >= 76) else "중간",
        "soil_temperature_0_to_7cm_mean": lambda o, t: "높음" if (o in ("<=", "<") and t <= 0) else ("높음" if (o in (">", ">=") and t >= 30) else "중간"),
        # 매장 피처
        "창고": lambda o, t: "높음" if (o in (">", ">=") and t >= 35) else "중간",
        "매장인원": lambda o, t: "높음" if (o in ("<=", "<") and t <= 5) else "중간",
        "일평균물동량": lambda o, t: "높음" if (o in (">", ">=") and t >= 325) else "중간",
        "일평균매출": lambda o, t: "높음" if (o in (">", ">=") and t >= 15000000) else "중간",
    }

    rule_fn = severity_rules.get(feature)
    if rule_fn:
        return rule_fn(op, threshold)
    return "중간"


# ──────────────────────────────────────────────
# 3. 리프 규칙 전체 해석
# ──────────────────────────────────────────────

def enrich_leaf_rule(
    rule_str: str,
    type_counts: dict | None = None,
    source: str | None = None,
) -> dict:
    """리프 규칙 문자열을 고도화된 해석 정보로 변환한다.

    Args:
        rule_str: "feature <= 1.5 & feature2 > 3.0" 형태
        type_counts: {"낙상": 20, "충돌": 5, ...} 사고유형 분포

    Returns:
        {
            "conditions": [...],          # 각 조건의 해석 리스트
            "scenario_label": str,        # 종합 위험 시나리오 라벨
            "risk_level": str,            # "높음"/"중간"/"낮음"
            "primary_risk_factors": [...], # 핵심 위험 요인 (심각도 높음인 것들)
            "weather_context": str,       # 기상 조건 요약
            "store_context": str,         # 매장 환경 요약
            "dominant_accident_type": str, # 최다 사고유형
            "explanation": str,           # 종합 설명 (LLM 프롬프트용)
        }
    """
    from core.rule_matcher import parse_rule

    parsed = parse_rule(rule_str)
    if not parsed:
        return {
            "conditions": [],
            "scenario_label": "기본 시나리오",
            "risk_level": "중간",
            "primary_risk_factors": [],
            "weather_context": "조건 없음",
            "store_context": "조건 없음",
            "dominant_accident_type": "",
            "explanation": "규칙 조건이 없는 루트 리프입니다.",
        }

    # 각 조건 해석
    conditions = []
    for feat, op, thresh in parsed:
        interp = interpret_condition(feat, op, thresh, source)
        conditions.append(interp)

    # 기상 vs 매장 분리
    weather_features = {
        "temperature_2m_min", "temperature_2m_max",
        "precipitation_sum", "snowfall_sum", "rain_sum",
        "wind_speed_10m_max", "relative_humidity_2m_mean",
        "soil_temperature_0_to_7cm_mean",
    }

    weather_conds = [c for c in conditions if c["feature"] in weather_features]
    store_conds = [c for c in conditions if c["feature"] not in weather_features]

    # 핵심 위험 요인 (심각도 높음)
    primary_risks = [c for c in conditions if c["severity"] == "높음"]

    # 종합 위험 등급
    if len(primary_risks) >= 2:
        risk_level = "높음"
    elif len(primary_risks) == 1:
        risk_level = "중간"
    else:
        risk_level = "낮음"

    # 기상 컨텍스트 요약
    weather_context = _summarize_weather(weather_conds)

    # 매장 컨텍스트 요약
    store_context = _summarize_store(store_conds)

    # 시나리오 라벨 생성
    scenario_label = _generate_scenario_label(weather_conds, store_conds, type_counts)

    # 최다 사고유형
    dominant_type = ""
    if type_counts:
        dominant_type = max(type_counts, key=type_counts.get)

    # 종합 설명 생성
    explanation = _generate_explanation(
        weather_conds, store_conds, primary_risks,
        risk_level, dominant_type, type_counts
    )

    return {
        "conditions": conditions,
        "scenario_label": scenario_label,
        "risk_level": risk_level,
        "primary_risk_factors": [
            {"feature": c["feature"], "label": c["label"], "risk": c["risk_desc"]}
            for c in primary_risks
        ],
        "weather_context": weather_context,
        "store_context": store_context,
        "dominant_accident_type": dominant_type,
        "explanation": explanation,
    }


def _summarize_weather(weather_conds: list[dict]) -> str:
    """기상 조건들을 한 줄 요약."""
    if not weather_conds:
        return "기상 조건 제한 없음 (전천후)"

    parts = []
    for c in weather_conds:
        parts.append(f"{c['label']}({c['feature']})")
    return " + ".join(parts)


def _summarize_store(store_conds: list[dict]) -> str:
    """매장 조건들을 한 줄 요약."""
    if not store_conds:
        return "매장 조건 제한 없음 (전 매장)"

    parts = []
    for c in store_conds:
        parts.append(f"{c['label']}({c['feature']})")
    return " + ".join(parts)


def _generate_scenario_label(
    weather_conds: list[dict],
    store_conds: list[dict],
    type_counts: dict | None,
) -> str:
    """종합 위험 시나리오 라벨 생성."""
    # 기상 기반 시나리오
    weather_labels = {c["label"] for c in weather_conds}
    store_labels = {c["label"] for c in store_conds}

    scenario_parts = []

    # 기상 시나리오
    if "극한파" in weather_labels or "한파" in weather_labels:
        scenario_parts.append("결빙·낙상")
    if "한파지속" in weather_labels:
        scenario_parts.append("종일결빙")
    if "폭염" in weather_labels or "폭염기" in weather_labels:
        scenario_parts.append("온열질환")
    if "많은비" in weather_labels or "보통비" in weather_labels:
        scenario_parts.append("우천미끄러짐")
    if "대설" in weather_labels or "소설" in weather_labels:
        scenario_parts.append("적설미끄러짐")
    if "강풍" in weather_labels or "폭풍" in weather_labels:
        scenario_parts.append("강풍전도")
    if "극습" in weather_labels or "고습" in weather_labels:
        scenario_parts.append("결로미끄러짐")

    # 매장 시나리오
    if "초대규모" in store_labels or "대규모" in store_labels:
        scenario_parts.append("대형창고작업")
    if "고물동" in store_labels:
        scenario_parts.append("고강도입고")
    if "극소" in store_labels:
        scenario_parts.append("인원부족과로")
    if "초고매출" in store_labels or "고매출" in store_labels:
        scenario_parts.append("고객혼잡")

    if not scenario_parts:
        # 사고유형 기반 fallback
        if type_counts:
            dominant = max(type_counts, key=type_counts.get)
            scenario_parts.append(f"{dominant}주의")
        else:
            scenario_parts.append("일반주의")

    return " · ".join(scenario_parts[:3])


def _generate_explanation(
    weather_conds: list[dict],
    store_conds: list[dict],
    primary_risks: list[dict],
    risk_level: str,
    dominant_type: str,
    type_counts: dict | None,
) -> str:
    """LLM 프롬프트에 삽입할 종합 설명 생성."""
    lines = []

    lines.append(f"[위험등급: {risk_level}] ", )

    if primary_risks:
        risk_descs = [f"{r['label']}({r['feature']}): {r['risk_desc']}" for r in primary_risks]
        lines.append(f"핵심 위험요인: {'; '.join(risk_descs)}")

    if weather_conds:
        w_summary = ", ".join([f"{c['label']}({c['risk_desc']})" for c in weather_conds])
        lines.append(f"기상환경: {w_summary}")

    if store_conds:
        s_summary = ", ".join([f"{c['label']}({c['risk_desc']})" for c in store_conds])
        lines.append(f"매장환경: {s_summary}")

    if type_counts and dominant_type:
        total = sum(type_counts.values())
        dom_count = type_counts.get(dominant_type, 0)
        pct = round(dom_count / total * 100, 1) if total > 0 else 0
        lines.append(f"과거 사고 패턴: {dominant_type} {pct}% ({dom_count}/{total}건)")

    return " | ".join(lines)


# ──────────────────────────────────────────────
# 4. 전체 리프 테이블 고도화
# ──────────────────────────────────────────────

def enrich_all_leaves(leaf_type_counts: dict) -> dict:
    """leaf_type_counts.json 전체를 고도화한다.

    Args:
        leaf_type_counts: {"label_column": ..., "leaves": {id: {rule, total, type_counts}}}

    Returns:
        {leaf_id: enrichment_dict, ...}
    """
    leaves = leaf_type_counts.get("leaves", {})
    result = {}

    for leaf_id, leaf_data in leaves.items():
        rule_str = leaf_data.get("rule", "")
        type_counts = leaf_data.get("type_counts", {})
        enrichment = enrich_leaf_rule(rule_str, type_counts)
        result[leaf_id] = enrichment

    return result


def get_leaf_context_for_prompt(
    leaf_id: str,
    leaf_type_counts: dict,
) -> str:
    """특정 리프의 고도화된 컨텍스트를 LLM 프롬프트용 문자열로 반환.

    Args:
        leaf_id: 리프 노드 ID
        leaf_type_counts: leaf_type_counts.json dict

    Returns:
        프롬프트에 삽입할 수 있는 컨텍스트 문자열
    """
    leaves = leaf_type_counts.get("leaves", {})
    leaf_data = leaves.get(str(leaf_id))
    if not leaf_data:
        return ""

    rule_str = leaf_data.get("rule", "")
    type_counts = leaf_data.get("type_counts", {})
    enrichment = enrich_leaf_rule(rule_str, type_counts)

    lines = [
        f"## 리프 노드 위험 분석 (ID: {leaf_id})",
        f"- 시나리오: {enrichment['scenario_label']}",
        f"- 위험등급: {enrichment['risk_level']}",
        f"- 기상환경: {enrichment['weather_context']}",
        f"- 매장환경: {enrichment['store_context']}",
        f"- 최다사고유형: {enrichment['dominant_accident_type']}",
    ]

    if enrichment["primary_risk_factors"]:
        lines.append("- 핵심위험요인:")
        for rf in enrichment["primary_risk_factors"]:
            lines.append(f"  * {rf['label']}({rf['feature']}): {rf['risk']}")

    lines.append(f"- 종합: {enrichment['explanation']}")

    return "\n".join(lines)
