"""
risk.py — 위험도 산출

리프 노드의 사고 건수와 사고유형 집중도를 기반으로 위험도를 산출한다.
"""


def calculate_risk(
    leaf_summary: dict,
    total_incidents: int,
    label_col: str = "사고유형",
) -> dict:
    """위험도 점수 및 등급 산출.

    Args:
        leaf_summary: 리프 노드의 summary dict
        total_incidents: 전체 사고 건수 (해당 소스)
        label_col: 라벨 컬럼명

    Returns:
        {
            "score": 0~100,
            "grade": "high" | "medium" | "low",
            "frequency_score": float,
            "concentration_score": float,
            "dominant_type": str,
            "dominant_ratio": float,
        }
    """
    leaf_count = leaf_summary.get("total", 0)
    type_dist = leaf_summary.get(label_col, {})

    # frequency_score: 해당 리프의 사고 빈도 (0~1)
    if total_incidents > 0:
        frequency_score = leaf_count / total_incidents
    else:
        frequency_score = 0

    # concentration_score: 상위 유형 비율 (0~1)
    if leaf_count > 0 and type_dist:
        dominant_type = max(type_dist, key=type_dist.get)
        dominant_count = type_dist[dominant_type]
        concentration_score = dominant_count / leaf_count
    else:
        dominant_type = "알 수 없음"
        concentration_score = 0

    dominant_ratio = concentration_score

    # 종합 위험도 (0~100)
    raw_score = (frequency_score * 0.4 + concentration_score * 0.6) * 100
    score = min(100, max(0, round(raw_score)))

    # 등급
    if score >= 70:
        grade = "high"
    elif score >= 50:
        grade = "medium"
    else:
        grade = "low"

    return {
        "score": score,
        "grade": grade,
        "frequency_score": round(frequency_score, 4),
        "concentration_score": round(concentration_score, 4),
        "dominant_type": dominant_type,
        "dominant_ratio": round(dominant_ratio, 4),
    }
