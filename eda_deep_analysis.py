"""
고객사고 + 직원사고 심층 분석
- 룰 기반 알림 시스템 설계를 위한 세밀한 조건별 인사이트 도출
"""

import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np

pd.set_option("display.max_columns", 50)
pd.set_option("display.width", 200)
pd.set_option("display.max_colwidth", 40)

# ──────────────────────────────────────────────
# 데이터 로드
# ──────────────────────────────────────────────
cust = pd.read_csv("data/processed/incidents_cust.csv")
emp = pd.read_csv("data/processed/incidents_emp.csv")

cust["사고유형"] = cust["사고유형"].str.strip()
dt_c = pd.to_datetime(cust["발생일시"], errors="coerce")
cust["발생_월"] = dt_c.dt.month
cust["발생_요일"] = dt_c.dt.dayofweek

def parse_hour(t):
    try:
        t = str(t).strip()
        if ":" in t:
            return int(t.split(":")[0].replace(" ", "")[-2:])
    except:
        pass
    return np.nan

cust["발생_시간"] = cust["발생시간"].apply(parse_hour)

# 직원사고 날짜
dt_e = pd.to_datetime(emp["발생일시"], errors="coerce")
emp["발생_월"] = dt_e.dt.month
emp["발생_요일"] = dt_e.dt.dayofweek

# 구간화 함수
def bucket(series, bins, labels):
    return pd.cut(series, bins=bins, labels=labels, include_lowest=True)

cust["비_여부"] = (cust["precipitation_sum"] > 0).map({True: "비옴", False: "안옴"})
cust["눈_여부"] = (cust["snowfall_sum"] > 0).map({True: "눈옴", False: "안옴"})
cust["습도구간"] = bucket(cust["relative_humidity_2m_mean"], [0,50,65,80,100], ["건조(<50)","보통(50-65)","습함(65-80)","매우습함(80+)"])

emp["비_여부"] = (emp["precipitation_sum"] > 0).map({True: "비옴", False: "안옴"})

print("=" * 90)
print("심층 분석 리포트 — 룰 기반 알림 시스템 설계용")
print(f"고객사고 {len(cust)}건 + 직원사고 {len(emp)}건")
print("=" * 90)

# ══════════════════════════════════════════════
# PART A: 고객사고 심층 분석
# ══════════════════════════════════════════════
print("\n\n" + "█" * 90)
print("PART A: 고객사고 심층 분석")
print("█" * 90)

# ──────────────────────────────────────────────
# A1. 시간대별 세분화 (2시간 단위)
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A1. 2시간 단위 시간대별 사고 패턴")
print("─" * 90)

cust["시간2h"] = bucket(cust["발생_시간"], [-1,8,10,12,14,16,18,20,22,24],
                       ["~8시","8-10","10-12","12-14","14-16","16-18","18-20","20-22","22-24"])

ct = pd.crosstab(cust["시간2h"], cust["사고유형"])
ct_pct = pd.crosstab(cust["시간2h"], cust["사고유형"], normalize="index") * 100
ct["합계"] = ct.sum(axis=1)
print("\n[건수]")
print(ct)
print("\n[비율(%)]")
print(ct_pct.round(1))

# ──────────────────────────────────────────────
# A2. 계절별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A2. 계절별 사고 패턴")
print("─" * 90)

def season(m):
    if m in [3,4,5]: return "봄"
    if m in [6,7,8]: return "여름"
    if m in [9,10,11]: return "가을"
    return "겨울"

cust["계절"] = cust["발생_월"].apply(season)
ct_season = pd.crosstab(cust["계절"], cust["사고유형"], margins=True)
ct_season_pct = pd.crosstab(cust["계절"], cust["사고유형"], normalize="index") * 100
print("\n[건수]")
print(ct_season)
print("\n[비율(%)]")
print(ct_season_pct.round(1))

# ──────────────────────────────────────────────
# A3. 비+기온 복합 조건
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A3. 비+기온 복합 조건별 사고유형 비율")
print("─" * 90)

def temp_simple(t):
    if pd.isna(t): return "미상"
    if t < 0: return "영하"
    if t < 15: return "0~15도"
    return "15도이상"

cust["기온3"] = cust["temperature_2m_mean"].apply(temp_simple)
cust["기상조건"] = cust["기온3"] + " / " + cust["비_여부"]

ct_weather = pd.crosstab(cust["기상조건"], cust["사고유형"])
ct_weather["합계"] = ct_weather.sum(axis=1)
ct_weather_pct = pd.crosstab(cust["기상조건"], cust["사고유형"], normalize="index") * 100

combined = ct_weather.copy()
for col in ct_weather_pct.columns:
    combined[f"{col}%"] = ct_weather_pct[col].round(1)
print(combined.sort_values("합계", ascending=False))

# ──────────────────────────────────────────────
# A4. 습도별 낙상 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A4. 습도 구간별 사고 패턴")
print("─" * 90)

ct_humid = pd.crosstab(cust["습도구간"], cust["사고유형"], margins=True)
ct_humid_pct = pd.crosstab(cust["습도구간"], cust["사고유형"], normalize="index") * 100
print("\n[건수]")
print(ct_humid)
print("\n[비율(%)]")
print(ct_humid_pct.round(1))

# ──────────────────────────────────────────────
# A5. 낙상 세부 원인 × 조건 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A5. 낙상 세부 원인별 발생 조건")
print("─" * 90)

fall = cust[cust["사고유형"] == "낙상"].copy()

# 원인2별 비/기온 조건
fall_causes = ["(바닥)물기", "(적재물)상품박스", "(부주의)고객", "(바닥)돌출물", "(시설)슬로프"]
for cause in fall_causes:
    sub = fall[fall["원인2"] == cause]
    if len(sub) < 5:
        continue
    rain_rate = (sub["비_여부"] == "비옴").mean() * 100
    avg_temp = sub["temperature_2m_mean"].mean()
    avg_humid = sub["relative_humidity_2m_mean"].mean()
    top_place = sub["장소"].value_counts().index[0]
    top_time = sub["시간2h"].value_counts().index[0] if sub["시간2h"].notna().any() else "미상"
    print(f"\n  [{cause}] {len(sub)}건")
    print(f"    비오는날 비율: {rain_rate:.1f}%  |  평균기온: {avg_temp:.1f}도  |  평균습도: {avg_humid:.1f}%")
    print(f"    주요장소: {top_place}  |  피크시간: {top_time}")

# ──────────────────────────────────────────────
# A6. 재물사고(누액) 세부 분석
# ──────────────────────────────────────────────
print("\n\n" + "─" * 90)
print("A6. 재물사고 — 누액 상세 분석")
print("─" * 90)

leak = cust[(cust["사고유형"] == "재물") & (cust["원인3"].str.strip() == "누액")].copy()
print(f"\n누액 사고 총 {len(leak)}건 (재물사고의 {len(leak)/len(cust[cust['사고유형']=='재물'])*100:.1f}%)")

print("\n[누액 원인2 분류]")
leak_cause2 = leak["원인2"].value_counts()
for c, n in leak_cause2.items():
    print(f"  {c}: {n}건 ({n/len(leak)*100:.1f}%)")

print("\n[누액 사고 기온별]")
leak_temp = pd.crosstab(leak["기온3"], leak["원인2"])
print(leak_temp)

print("\n[누액 사고 시간대별]")
leak_time = leak["시간2h"].value_counts().sort_index()
for t, n in leak_time.items():
    print(f"  {t}: {n}건")

# ──────────────────────────────────────────────
# A7. 매장 규모 × 층수 × 사고유형
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A7. 매장 층수별 사고 패턴")
print("─" * 90)

cust["층수_clean"] = cust["층수"].astype(str).str.strip()
cust.loc[cust["층수_clean"].isin(["nan", ""]), "층수_clean"] = "미상"

ct_floor = pd.crosstab(cust["층수_clean"], cust["사고유형"], margins=True)
ct_floor_pct = pd.crosstab(cust["층수_clean"], cust["사고유형"], normalize="index") * 100
print("\n[건수]")
print(ct_floor)
print("\n[비율(%)]")
print(ct_floor_pct.round(1))

# ──────────────────────────────────────────────
# A8. 엘리베이터/에스컬레이터 유무별
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A8. 엘리베이터 유무별 사고 패턴")
print("─" * 90)

cust["엘베유무"] = cust["엘레베이터"].astype(str).str.strip().str.upper()
cust.loc[~cust["엘베유무"].isin(["O", "X"]), "엘베유무"] = "미상"

ct_elev = pd.crosstab(cust["엘베유무"], cust["사고유형"], margins=True)
ct_elev_pct = pd.crosstab(cust["엘베유무"], cust["사고유형"], normalize="index") * 100
print("\n[건수]")
print(ct_elev)
print("\n[비율(%)]")
print(ct_elev_pct.round(1))

# ──────────────────────────────────────────────
# A9. 보상금액 상위 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A9. 고액 보상 사고 패턴 (상위 30건)")
print("─" * 90)

cust["보상금액_num"] = pd.to_numeric(cust["보상금액"], errors="coerce")
top_comp = cust.nlargest(30, "보상금액_num")[["매장명", "사고유형", "장소", "원인2", "원인3", "보상금액_num", "처리과정"]]
print(top_comp.to_string(index=False))

print("\n[고액 보상(100만원 이상) 사고유형 분포]")
high = cust[cust["보상금액_num"] >= 1000000]
print(f"  총 {len(high)}건")
print(high["사고유형"].value_counts().to_string())
print("\n[고액 보상 원인2 Top 10]")
print(high["원인2"].value_counts().head(10).to_string())
print("\n[고액 보상 장소]")
print(high["장소"].value_counts().to_string())

# ──────────────────────────────────────────────
# A10. 연령대별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A10. 연령대별 사고 패턴")
print("─" * 90)

age_order = ["10세 이하", "10대 이하", "10대", "20대", "30대", "40대", "50대", "60대", "70대", "80대", "90대", "미상"]
ct_age = pd.crosstab(cust["연령대"].str.strip(), cust["사고유형"])
ct_age["합계"] = ct_age.sum(axis=1)
ct_age_pct = pd.crosstab(cust["연령대"].str.strip(), cust["사고유형"], normalize="index") * 100
print("\n[건수]")
print(ct_age.reindex([a for a in age_order if a in ct_age.index]))
print("\n[비율(%)]")
print(ct_age_pct.reindex([a for a in age_order if a in ct_age_pct.index]).round(1))

# ──────────────────────────────────────────────
# A11. 사고 반복 매장 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("A11. 사고 반복 매장 — 동일 유형 반복 패턴")
print("─" * 90)

store_type = cust.groupby(["매장명", "사고유형"]).size().reset_index(name="건수")
repeat = store_type[store_type["건수"] >= 3].sort_values("건수", ascending=False)
print(f"\n동일 매장에서 같은 유형 사고 3건 이상: {len(repeat)}개 조합")
print(repeat.head(20).to_string(index=False))


# ══════════════════════════════════════════════
# PART B: 직원사고 분석
# ══════════════════════════════════════════════
print("\n\n" + "█" * 90)
print("PART B: 직원사고 분석 (448건)")
print("█" * 90)

# ──────────────────────────────────────────────
# B1. 재해 유형 분포
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B1. 직원 재해 유형 분포")
print("─" * 90)
print(emp["재해 유형"].value_counts().to_string())

# ──────────────────────────────────────────────
# B2. 기인물 Top 20
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B2. 직원사고 기인물 Top 20")
print("─" * 90)
print(emp["기인물"].value_counts().head(20).to_string())

# ──────────────────────────────────────────────
# B3. 근속기간별 사고
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B3. 근속기간별 사고 건수")
print("─" * 90)

emp["근속_num"] = emp["근속기간 (년)"].str.replace("년", "").astype(float)
emp["근속구간"] = pd.cut(emp["근속_num"], bins=[-1,0,1,3,5,100], labels=["신입(0년)","1년","2-3년","4-5년","6년이상"])
ct_tenure = pd.crosstab(emp["근속구간"], emp["재해 유형"], margins=True)
print(ct_tenure)

print("\n[근속구간별 재해유형 비율(%)]")
ct_tenure_pct = pd.crosstab(emp["근속구간"], emp["재해 유형"], normalize="index") * 100
print(ct_tenure_pct.round(1))

# ──────────────────────────────────────────────
# B4. 직원사고 기상 조건
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B4. 직원사고 기상 조건별")
print("─" * 90)

ct_emp_rain = pd.crosstab(emp["비_여부"], emp["재해 유형"], margins=True)
print(ct_emp_rain)

# ──────────────────────────────────────────────
# B5. 직원사고 월별
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B5. 직원사고 월별 건수")
print("─" * 90)
emp_month = emp["발생_월"].value_counts().sort_index()
for m, c in emp_month.items():
    print(f"  {int(m)}월: {c}건")

# ──────────────────────────────────────────────
# B6. 직원 넘어짐 사고 기인물
# ──────────────────────────────────────────────
print("\n" + "─" * 90)
print("B6. 직원 넘어짐 사고(148건) 기인물")
print("─" * 90)
fall_emp = emp[emp["재해 유형"] == "넘어짐"]
print(fall_emp["기인물"].value_counts().head(15).to_string())

print(f"\n넘어짐 사고 비오는날 비율: {(fall_emp['비_여부']=='비옴').mean()*100:.1f}%")
print(f"전체 직원사고 비오는날 비율: {(emp['비_여부']=='비옴').mean()*100:.1f}%")


# ══════════════════════════════════════════════
# PART C: 룰 기반 알림 시스템용 종합 인사이트
# ══════════════════════════════════════════════
print("\n\n" + "█" * 90)
print("PART C: 룰 기반 알림 시스템용 종합 인사이트")
print("█" * 90)

print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[기상 조건 기반 룰]

  룰1. 비 + 영하 → 낙상 최고위험 (낙상 비율 55%+)
       알림: "빙판/눈길 주의. 입구·슬로프·계단 미끄럼방지 매트 점검, 제설작업 확인"

  룰2. 비 + 0~15도 → 낙상 주의 (낙상 비율 47%)
       알림: "우천으로 바닥 물기 주의. 입구 레인매트 상태 확인, 매장 내 물기 수시 제거"

  룰3. 비 + 15도 이상 (여름 장마) → 낙상 + 재물 동시 주의
       알림: "우천 시 바닥 물기 주의 + 액체세제류 누액 점검"

  룰4. 습도 80% 이상 → 낙상 비율 상승 (49%+)
       알림: "고습도로 바닥 미끄러움 증가. 매장 내 환기 및 바닥 상태 점검"

  룰5. 풍속 6m/s 이상 → 외부 시설물 점검
       알림: "강풍 주의. 외부 배너·파지보관함·X배너 고정 상태 점검"

  룰6. 눈 → 낙상 비율 50% (전체 대비 +6%p)
       알림: "적설 주의. 주차장·입구·슬로프 제설 및 미끄럼방지 조치"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[시간대 기반 룰]

  룰7. 14~18시 (피크타임) → 전체 사고의 35%+ 집중
       알림: "오후 피크타임 진입. 동선 상 박스 정리, 안전 순찰 강화"

  룰8. 20~22시 (마감 전) → 재물사고 비율 상승 (33%+)
       알림: "마감 전 청소·정리 시 고객 동선 주의. 물걸레 사용 후 바닥 건조 확인"

  룰9. 토·일요일 → 주중 대비 사고 20%+ 증가
       알림: "주말 고객 증가. 안전 관리 인력 추가 배치"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[매장 환경 기반 룰]

  룰10. 소형 매장 (<150평) → 낙상 비율 54% (최고)
        알림: "소형 매장 동선 확보 필수. 박스·적재물 즉시 정리"

  룰11. 엘리베이터 없는 매장 → 계단 낙상 집중
        알림: "계단 이용 매장. 계단 논슬립·핸드레일 상태 점검"

  룰12. 다층 매장 (3층 이상) → 계단·에스컬레이터 사고 주의
        알림: "다층 매장 계단·승강기 안전 점검"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[인력 조건 기반 룰]

  룰13. 정규비율 30% 미만 → 재물사고 비율 33% (최고)
        알림: "비정규직 비율 높은 매장. 상품 취급·진열 안전교육 강화"

  룰14. 매장인원 5명 이하 → 재물사고 비율 34% (최고)
        알림: "소인원 매장. 입고·진열 시 고객 동선 관리 어려움 주의"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[상품 관련 룰]

  룰15. 상시 → 액체세제류(락스, 배수관세척제) 누액 점검
        알림: "액체세제 매대 뚜껑 상태 점검. 파손·누액 상품 즉시 제거"
        (재물사고의 51%가 누액, 그 중 대부분이 락스/세제류)

  룰16. 상시 → 유리제품 매대 파손 점검
        알림: "유리제품 매대 파손 상품 확인. 자상사고 예방"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[연령대 기반 룰]

  룰17. 70대 이상 고객 → 낙상 비율 55%+, 보상금액 최고
        알림: "고령 고객 다수 방문 시간대. 계단·슬로프 안전 주의"

  룰18. 10세 이하 아동 → 충돌·끼임 사고 비율 높음
        알림: "아동 동반 고객 주의. 자동문·에스컬레이터·매대 모서리 안전"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[직원사고 기반 룰]

  룰19. 신입(0년) 직원 → 전체 직원사고의 40%, 넘어짐·무리한동작 집중
        알림: "신규 입사자 안전교육 필수. 박스 취급·계단 이동·사다리 사용법"

  룰20. 비오는 날 직원 → 넘어짐 사고 비율 상승
        알림: "우천 시 직원 이동·하역 작업 시 미끄럼 주의"

  룰21. 상시 → 박스·롤테이너·사다리가 직원사고 3대 기인물
        알림: "입고·진열 작업 시 박스 적재 높이 준수, 사다리 안전 사용"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[비용 절감 우선순위]

  1순위: 낙상 예방 (평균 보상 142만원, 전체 보상의 65%)
         → 바닥 물기 관리 + 박스 정리 + 계단 안전
  2순위: 재물(누액) 예방 (건수 최다, 평균 36만원)
         → 액체세제 뚜껑 점검 루틴화
  3순위: 충돌 예방 (평균 50만원)
         → 직원 이동 시 고객 동선 주의, L카·롤테이너 운행 안전
""")

print("분석 완료!")
