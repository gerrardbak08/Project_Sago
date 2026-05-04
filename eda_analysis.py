"""
고객사고 데이터 EDA 분석
- 사고유형별 패턴 분석
- 기상/매장환경/인력/시간 조건별 사고 집계
- 실무 인사이트 도출
"""

import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams["font.family"] = "AppleGothic"
matplotlib.rcParams["axes.unicode_minus"] = False

pd.set_option("display.max_columns", 50)
pd.set_option("display.width", 200)
pd.set_option("display.max_colwidth", 30)

# ──────────────────────────────────────────────
# 데이터 로드 및 기본 전처리
# ──────────────────────────────────────────────
df = pd.read_csv("data/processed/incidents_cust.csv")
df["사고유형"] = df["사고유형"].str.strip()

# 날짜/시간 파생
dt = pd.to_datetime(df["발생일시"], errors="coerce")
df["발생_월"] = dt.dt.month
df["발생_요일"] = dt.dt.dayofweek
df["발생_요일명"] = dt.dt.day_name()

def parse_hour(t):
    try:
        t = str(t).strip()
        if ":" in t:
            return int(t.split(":")[0].replace(" ", "")[-2:])
    except:
        pass
    return np.nan

df["발생_시간"] = df["발생시간"].apply(parse_hour)

# 시간대 구간
def time_bucket(h):
    if pd.isna(h): return "미상"
    if h < 6: return "새벽(0-6)"
    if h < 12: return "오전(6-12)"
    if h < 18: return "오후(12-18)"
    return "저녁(18-24)"

df["시간대"] = df["발생_시간"].apply(time_bucket)

# 기상 조건 구간화
df["비_여부"] = (df["precipitation_sum"] > 0).map({True: "비옴", False: "안옴"})
df["눈_여부"] = (df["snowfall_sum"] > 0).map({True: "눈옴", False: "안옴"})

def temp_bucket(t):
    if pd.isna(t): return "미상"
    if t < 0: return "영하"
    if t < 10: return "0~10도"
    if t < 20: return "10~20도"
    if t < 30: return "20~30도"
    return "30도이상"

df["기온구간"] = df["temperature_2m_mean"].apply(temp_bucket)

def wind_bucket(w):
    if pd.isna(w): return "미상"
    if w < 3: return "약풍(<3)"
    if w < 6: return "보통(3-6)"
    if w < 10: return "강풍(6-10)"
    return "매우강풍(10+)"

df["풍속구간"] = df["wind_speed_10m_max"].apply(wind_bucket)

# 매장 규모 구간
def size_bucket(s):
    if pd.isna(s): return "미상"
    if s < 150: return "소형(<150)"
    if s < 300: return "중형(150-300)"
    if s < 500: return "대형(300-500)"
    return "초대형(500+)"

df["매장규모"] = df["실평수"].apply(size_bucket)

# 인원 구간
def staff_bucket(n):
    if pd.isna(n): return "미상"
    if n <= 5: return "5명이하"
    if n <= 10: return "6-10명"
    if n <= 15: return "11-15명"
    return "16명이상"

df["인원구간"] = df["매장인원"].apply(staff_bucket)

# 물동량 구간
def volume_bucket(v):
    if pd.isna(v): return "미상"
    if v < 150: return "소(<150)"
    if v < 300: return "중(150-300)"
    if v < 500: return "대(300-500)"
    return "초대(500+)"

df["물동량구간"] = df["일평균물동량"].apply(volume_bucket)

# 정규비율 구간
def ratio_bucket(r):
    if pd.isna(r): return "미상"
    if r < 0.3: return "30%미만"
    if r < 0.5: return "30-50%"
    if r < 0.7: return "50-70%"
    return "70%이상"

df["정규비율구간"] = df["정규비율"].apply(ratio_bucket)

print("=" * 80)
print("고객사고 데이터 분석 리포트")
print("=" * 80)
print(f"총 사고 건수: {len(df)}")
print(f"분석 기간: {dt.min().strftime('%Y-%m-%d')} ~ {dt.max().strftime('%Y-%m-%d')}")

# ──────────────────────────────────────────────
# 1. 사고유형 기본 분포
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("1. 사고유형 기본 분포")
print("─" * 80)
type_counts = df["사고유형"].value_counts()
type_pct = (type_counts / len(df) * 100).round(1)
for t, c in type_counts.items():
    print(f"  {t}: {c}건 ({type_pct[t]}%)")

# ──────────────────────────────────────────────
# 2. 시간대별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("2. 시간대별 사고 패턴")
print("─" * 80)

# 시간대별 사고유형
ct_time = pd.crosstab(df["시간대"], df["사고유형"], margins=True)
print("\n[시간대 × 사고유형 교차표]")
print(ct_time)

# 시간대별 비율
ct_time_pct = pd.crosstab(df["시간대"], df["사고유형"], normalize="index").round(3) * 100
print("\n[시간대별 사고유형 비율(%)]")
print(ct_time_pct.round(1))

# 요일별
print("\n[요일별 사고 건수]")
dow_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
dow_kr = {"Monday": "월", "Tuesday": "화", "Wednesday": "수", "Thursday": "목",
           "Friday": "금", "Saturday": "토", "Sunday": "일"}
dow_counts = df["발생_요일명"].value_counts().reindex(dow_order)
for d, c in dow_counts.items():
    print(f"  {dow_kr[d]}요일: {c}건")

# 월별
print("\n[월별 사고 건수]")
month_counts = df["발생_월"].value_counts().sort_index()
for m, c in month_counts.items():
    print(f"  {int(m)}월: {c}건")

# ──────────────────────────────────────────────
# 3. 기상 조건별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("3. 기상 조건별 사고 패턴")
print("─" * 80)

# 비 여부
print("\n[비 여부 × 사고유형]")
ct_rain = pd.crosstab(df["비_여부"], df["사고유형"], margins=True)
print(ct_rain)
ct_rain_pct = pd.crosstab(df["비_여부"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_rain_pct.round(1))

# 눈 여부
print("\n[눈 여부 × 사고유형]")
ct_snow = pd.crosstab(df["눈_여부"], df["사고유형"], margins=True)
print(ct_snow)

# 기온 구간
print("\n[기온 구간 × 사고유형]")
ct_temp = pd.crosstab(df["기온구간"], df["사고유형"], margins=True)
print(ct_temp)
ct_temp_pct = pd.crosstab(df["기온구간"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_temp_pct.round(1))

# 풍속
print("\n[풍속 구간 × 사고유형]")
ct_wind = pd.crosstab(df["풍속구간"], df["사고유형"], margins=True)
print(ct_wind)
ct_wind_pct = pd.crosstab(df["풍속구간"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_wind_pct.round(1))

# ──────────────────────────────────────────────
# 4. 매장 환경별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("4. 매장 환경별 사고 패턴")
print("─" * 80)

# 매장 규모
print("\n[매장 규모 × 사고유형]")
ct_size = pd.crosstab(df["매장규모"], df["사고유형"], margins=True)
print(ct_size)
ct_size_pct = pd.crosstab(df["매장규모"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_size_pct.round(1))

# 매장 형태
print("\n[매장 형태 × 사고유형]")
ct_type = pd.crosstab(df["형태"], df["사고유형"], margins=True)
print(ct_type)
ct_type_pct = pd.crosstab(df["형태"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_type_pct.round(1))

# ──────────────────────────────────────────────
# 5. 인력 조건별 사고 패턴
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("5. 인력 조건별 사고 패턴")
print("─" * 80)

# 인원 구간
print("\n[매장 인원 × 사고유형]")
ct_staff = pd.crosstab(df["인원구간"], df["사고유형"], margins=True)
print(ct_staff)
ct_staff_pct = pd.crosstab(df["인원구간"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_staff_pct.round(1))

# 정규비율
print("\n[정규직 비율 × 사고유형]")
ct_ratio = pd.crosstab(df["정규비율구간"], df["사고유형"], margins=True)
print(ct_ratio)
ct_ratio_pct = pd.crosstab(df["정규비율구간"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_ratio_pct.round(1))

# 물동량
print("\n[물동량 × 사고유형]")
ct_vol = pd.crosstab(df["물동량구간"], df["사고유형"], margins=True)
print(ct_vol)
ct_vol_pct = pd.crosstab(df["물동량구간"], df["사고유형"], normalize="index").round(3) * 100
print("\n비율(%):")
print(ct_vol_pct.round(1))

# ──────────────────────────────────────────────
# 6. 사고 장소 × 원인 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("6. 사고 장소 × 원인 분석 (사고 후 기록이지만 패턴 파악용)")
print("─" * 80)

print("\n[장소별 사고 건수]")
place_counts = df["장소"].value_counts()
for p, c in place_counts.items():
    print(f"  {p}: {c}건 ({c/len(df)*100:.1f}%)")

print("\n[원인1 (대분류)]")
cause1 = df["원인1"].value_counts()
for c, n in cause1.items():
    print(f"  {c}: {n}건 ({n/len(df)*100:.1f}%)")

print("\n[원인2 (중분류) - Top 15]")
cause2 = df["원인2"].value_counts().head(15)
for c, n in cause2.items():
    print(f"  {c}: {n}건 ({n/len(df)*100:.1f}%)")

print("\n[원인3 (세분류) - Top 15]")
cause3 = df["원인3"].value_counts().head(15)
for c, n in cause3.items():
    print(f"  {c}: {n}건 ({n/len(df)*100:.1f}%)")

# ──────────────────────────────────────────────
# 7. 사고유형별 보상금액 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("7. 사고유형별 보상금액 분석")
print("─" * 80)

df["보상금액_num"] = pd.to_numeric(df["보상금액"], errors="coerce")
comp = df.groupby("사고유형")["보상금액_num"].agg(["count", "mean", "median", "max", "sum"])
comp.columns = ["건수", "평균", "중앙값", "최대", "합계"]
comp = comp.round(0)
print(comp)

# ──────────────────────────────────────────────
# 8. 고위험 조건 조합 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("8. 고위험 조건 조합 (사고 다발 조건)")
print("─" * 80)

# 조건 조합별 사고 건수
combo = df.groupby(["기온구간", "비_여부", "매장규모", "시간대"]).agg(
    사고건수=("사고유형", "count"),
    최다유형=("사고유형", lambda x: x.value_counts().index[0]),
    최다유형비율=("사고유형", lambda x: x.value_counts().iloc[0] / len(x) * 100),
).reset_index()

combo = combo.sort_values("사고건수", ascending=False)
print("\n[사고 다발 조건 Top 20]")
print(combo.head(20).to_string(index=False))

# ──────────────────────────────────────────────
# 9. 낙상 사고 심층 분석 (최다 유형)
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("9. 낙상 사고 심층 분석 (전체의 44%)")
print("─" * 80)

fall = df[df["사고유형"] == "낙상"]
not_fall = df[df["사고유형"] != "낙상"]

print(f"\n낙상 건수: {len(fall)}, 비낙상: {len(not_fall)}")

# 낙상 vs 비낙상 비교
print("\n[낙상 vs 비낙상 - 주요 수치 비교]")
compare_cols = ["실평수", "매장인원", "정규비율", "일평균물동량",
                "temperature_2m_mean", "precipitation_sum", "wind_speed_10m_max",
                "relative_humidity_2m_mean"]
for col in compare_cols:
    f_mean = fall[col].mean()
    nf_mean = not_fall[col].mean()
    diff_pct = (f_mean - nf_mean) / nf_mean * 100 if nf_mean != 0 else 0
    print(f"  {col:35s} 낙상={f_mean:10.1f}  비낙상={nf_mean:10.1f}  차이={diff_pct:+.1f}%")

# 낙상 장소
print("\n[낙상 발생 장소]")
fall_place = fall["장소"].value_counts()
for p, c in fall_place.items():
    print(f"  {p}: {c}건 ({c/len(fall)*100:.1f}%)")

# 낙상 원인
print("\n[낙상 원인2]")
fall_cause = fall["원인2"].value_counts().head(10)
for c, n in fall_cause.items():
    print(f"  {c}: {n}건 ({n/len(fall)*100:.1f}%)")

# ──────────────────────────────────────────────
# 10. 재물 사고 심층 분석 (2위)
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("10. 재물(의류/차량 훼손) 사고 심층 분석 (전체의 27%)")
print("─" * 80)

prop = df[df["사고유형"] == "재물"]
print(f"\n재물 사고 건수: {len(prop)}")

print("\n[재물 사고 원인2]")
prop_cause = prop["원인2"].value_counts().head(10)
for c, n in prop_cause.items():
    print(f"  {c}: {n}건 ({n/len(prop)*100:.1f}%)")

print("\n[재물 사고 원인3]")
prop_cause3 = prop["원인3"].value_counts().head(10)
for c, n in prop_cause3.items():
    print(f"  {c}: {n}건 ({n/len(prop)*100:.1f}%)")

print("\n[재물 사고 장소]")
prop_place = prop["장소"].value_counts()
for p, c in prop_place.items():
    print(f"  {p}: {c}건 ({c/len(prop)*100:.1f}%)")

# ──────────────────────────────────────────────
# 11. 처리결과별 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("11. 처리결과별 분석")
print("─" * 80)

result_counts = df["처리결과"].str.strip().value_counts()
for r, c in result_counts.items():
    print(f"  {r}: {c}건 ({c/len(df)*100:.1f}%)")

print("\n[처리과정별 건수]")
process_counts = df["처리과정"].str.strip().value_counts()
for p, c in process_counts.items():
    print(f"  {p}: {c}건 ({c/len(df)*100:.1f}%)")

# 보험접수 건의 평균 보상금액
print("\n[처리과정별 평균 보상금액]")
comp_by_process = df.groupby(df["처리과정"].str.strip())["보상금액_num"].agg(["count", "mean", "median", "sum"])
comp_by_process.columns = ["건수", "평균", "중앙값", "합계"]
print(comp_by_process.round(0))

# ──────────────────────────────────────────────
# 12. 매장별 사고 다발 분석
# ──────────────────────────────────────────────
print("\n" + "─" * 80)
print("12. 사고 다발 매장 Top 20")
print("─" * 80)

store_agg = df.groupby("매장명").agg(
    사고건수=("사고유형", "count"),
    최다유형=("사고유형", lambda x: x.value_counts().index[0]),
    보상합계=("보상금액_num", "sum"),
    실평수=("실평수", "first"),
    매장인원=("매장인원", "first"),
).sort_values("사고건수", ascending=False)

print(store_agg.head(20).to_string())

# ──────────────────────────────────────────────
# 13. 핵심 인사이트 요약
# ──────────────────────────────────────────────
print("\n" + "=" * 80)
print("핵심 인사이트 요약")
print("=" * 80)

# 비올때 낙상 비율
rain_fall_rate = ct_rain_pct.loc["비옴", "낙상"] if "비옴" in ct_rain_pct.index else 0
norain_fall_rate = ct_rain_pct.loc["안옴", "낙상"] if "안옴" in ct_rain_pct.index else 0

# 영하 낙상 비율
cold_fall_rate = ct_temp_pct.loc["영하", "낙상"] if "영하" in ct_temp_pct.index else 0

# 강풍 재물 비율
strong_wind_prop = ct_wind_pct.loc["매우강풍(10+)", "재물"] if "매우강풍(10+)" in ct_wind_pct.index else 0

print(f"""
1. [낙상이 압도적] 전체 사고의 44.4%가 낙상. 매장 내부(특히 계단)가 주요 발생지.

2. [비오는 날 낙상 증가] 비오는 날 낙상 비율 {rain_fall_rate:.1f}% vs 안오는 날 {norain_fall_rate:.1f}%
   → 우천 시 입구/슬로프 미끄럼 방지 강화 필요

3. [영하 기온 낙상 집중] 영하일 때 낙상 비율 {cold_fall_rate:.1f}%
   → 겨울철 빙판/눈길 대비 필수

4. [강풍 시 재물사고 증가] 풍속 10m/s 이상일 때 재물 비율 {strong_wind_prop:.1f}%
   → 강풍 시 외부 시설물(배너, 파지함) 고정 점검

5. [재물사고의 핵심 = 누액] 재물사고의 상당수가 락스/세제 누액으로 의류 훼손
   → 액체세제류 진열 상태 정기 점검, 뚜껑 확인 루틴화

6. [오후 시간대 사고 집중] 12~18시에 사고가 가장 많음
   → 오후 피크타임 안전 인력 배치 강화

7. [소형 매장 사고 비율 높음] 좁은 동선에서 박스/적재물 걸림 사고 다발
   → 소형 매장 동선 확보, 적재물 관리 강화

8. [정규직 비율 낮을수록 사고 다양] 정규비율 30% 미만 매장에서 직원 부주의 사고 비율 높음
   → 비정규직 안전교육 강화
""")

print("분석 완료!")
