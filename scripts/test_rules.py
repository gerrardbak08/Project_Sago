"""규칙별 사례 매칭 건수 확인 스크립트."""
import pandas as pd

CUST_RULES = [
    {"id": "cust_freezing_severe", "name": "한파·결빙 (-4°C 이하)", "conditions": {"temperature_2m_min": {"lte": -4}}},
    {"id": "cust_freezing_mild", "name": "결빙 주의 (0~-4°C)", "conditions": {"temperature_2m_min": {"gt": -4, "lte": 0}}},
    {"id": "cust_rainy_heavy", "name": "강수 (10mm 초과)", "conditions": {"rain_sum": {"gt": 10}}},
    {"id": "cust_rainy_light", "name": "약한 비 (1~10mm)", "conditions": {"rain_sum": {"gt": 1, "lte": 10}}},
    {"id": "cust_windy", "name": "강풍 (6m/s 초과)", "conditions": {"wind_speed_10m_max": {"gt": 6}}},
    {"id": "cust_hot_summer", "name": "폭염 (토양온도 27°C 초과)", "conditions": {"soil_temperature_0_to_7cm_mean": {"gt": 27}}},
    {"id": "cust_humid", "name": "고습 (습도 77% 초과)", "conditions": {"relative_humidity_2m_mean": {"gt": 77}}},
    {"id": "cust_small_store_no_warehouse", "name": "소형매장·창고없음", "conditions": {"평수": {"lte": 150}, "창고": {"lte": 5}}},
    {"id": "cust_large_store_high_traffic", "name": "대형매장·고물동", "conditions": {"평수": {"gt": 300}, "일평균물동량": {"gt": 325}}},
    {"id": "cust_high_sales", "name": "고매출·고혼잡 (1300만초과)", "conditions": {"일평균매출": {"gt": 13000000}}},
    {"id": "cust_large_warehouse", "name": "대형 창고 (>35평)", "conditions": {"창고": {"gt": 35}}},
    {"id": "cust_understaffed", "name": "인원 부족 (≤5명)", "conditions": {"매장인원": {"lte": 5}}},
    {"id": "cust_cold_large_store", "name": "저온+대형매장", "conditions": {"temperature_2m_max": {"lte": 8}, "평수": {"gt": 300}}},
    {"id": "cust_rainy_high_traffic", "name": "우천+고물동", "conditions": {"precipitation_sum": {"gt": 3}, "일평균물동량": {"gt": 325}}},
]

EMP_RULES = [
    {"id": "emp_cold", "name": "저온 (≤2°C)", "conditions": {"temperature_2m_min": {"lte": 2}}},
    {"id": "emp_calm_wind", "name": "무풍 (≤2m/s)", "conditions": {"wind_speed_10m_max": {"lte": 2}}},
    {"id": "emp_large_warehouse_high_helper", "name": "대형창고·고입고", "conditions": {"창고": {"gt": 13}, "입고도우미PO": {"gt": 1.15}}},
    {"id": "emp_large_display", "name": "대형 진열면적", "conditions": {"진열평수": {"gt": 255}, "계약면적(㎡)": {"gt": 1250}}},
    {"id": "emp_small_warehouse", "name": "소형 창고 (≤9.5)", "conditions": {"창고": {"lte": 9.5}}},
    {"id": "emp_high_sales_small_warehouse", "name": "고매출·소형창고", "conditions": {"일평균매출": {"gt": 7500000}, "창고": {"lte": 13}}},
    {"id": "emp_understaffed_large", "name": "인원부족·대형매장", "conditions": {"매장인원": {"lte": 9.4}, "일평균매출": {"gt": 7500000}}},
    {"id": "emp_high_helper", "name": "입고 작업 과다 (>0.85)", "conditions": {"입고도우미PO": {"gt": 0.85}}},
    {"id": "emp_humid_small", "name": "고습·소형매장", "conditions": {"relative_humidity_2m_mean": {"gt": 76}, "계약면적(㎡)": {"lte": 916}}},
    {"id": "emp_very_large_warehouse", "name": "초대형 창고 (>35)", "conditions": {"창고": {"gt": 35}}},
]


def check_condition(value, cond):
    if value is None or pd.isna(value):
        return False
    for op, threshold in cond.items():
        if op == "gt" and not (value > threshold):
            return False
        if op == "gte" and not (value >= threshold):
            return False
        if op == "lt" and not (value < threshold):
            return False
        if op == "lte" and not (value <= threshold):
            return False
    return True


def matches_rule(row, rule):
    for feature, cond in rule["conditions"].items():
        value = row.get(feature)
        if not check_condition(value, cond):
            return False
    return True


def analyze(df, rules, label):
    print(f"\n=== {label} ({len(df)}건) ===")
    print(f"{'규칙ID':<40} {'이름':<25} {'건수':>6}")
    print("-" * 75)
    total_matched = set()
    for rule in rules:
        matched_mask = df.apply(lambda row: matches_rule(row, rule), axis=1)
        count = matched_mask.sum()
        total_matched.update(df[matched_mask].index.tolist())
        print(f"{rule['id']:<40} {rule['name']:<25} {count:>6}")
    print(f"\n합집합 매칭: {len(total_matched)}/{len(df)} ({100*len(total_matched)/len(df):.1f}%)")
    print(f"미매칭: {len(df) - len(total_matched)}건")


if __name__ == "__main__":
    cust_df = pd.read_csv("processed/incidents_cust.csv")
    emp_df = pd.read_csv("processed/incidents_emp.csv")
    analyze(cust_df, CUST_RULES, "CUST")
    analyze(emp_df, EMP_RULES, "EMP")
