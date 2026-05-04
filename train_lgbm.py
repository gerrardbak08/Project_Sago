"""
LGBM 다중분류 모델 학습 스크립트 (v2)
- 타겟: 사고유형
- 피처: 매장/인력/날씨 등 사전 정보만 사용 (사고 후 기록 변수 제외)
- 하이퍼파라미터 최적화: Optuna
- 학습/테스트: 8:2
- 피처 중요도 시각화 포함
"""

import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
import lightgbm as lgb
import optuna
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score, f1_score
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams["font.family"] = "AppleGothic"
matplotlib.rcParams["axes.unicode_minus"] = False

# ──────────────────────────────────────────────
# 1. 데이터 로드 및 전처리
# ──────────────────────────────────────────────
DATA_PATH = "data/processed/incidents_cust.csv"
TARGET = "사고유형"
SEED = 42

df = pd.read_csv(DATA_PATH)
print(f"원본 데이터: {df.shape}")

# 타겟 공백 정리
df[TARGET] = df[TARGET].str.strip()
print(f"\n[타겟 분포]\n{df[TARGET].value_counts()}")

# ──────────────────────────────────────────────
# 2. 피처 선택
#    - 사고 발생 후 기록되는 변수는 모두 제외
#    - 발생일시/발생시간에서 월, 요일, 시간대만 파생
# ──────────────────────────────────────────────
# 사고 후 기록 변수 (데이터 누수 방지를 위해 전부 제외)
POST_INCIDENT_COLS = [
    "건수", "부문명", "지역명", "매장명",
    "층수", "엘레베이터", "링고벨",
    "연령대", "성별",
    "발생일시", "발생시간",
    "CS접수일", "종결일시", "소요일",
    "처리과정", "처리결과", "보상금액",
    "락스 품명 품번", "사고내용요약",
    TARGET,
    "장소", "원인1", "원인2", "원인3",
    "비고", "진척도",
]

# 상수 컬럼 제외
CONST_COLS = ["source"]  # 값이 'cust' 1개

# 발생일시/발생시간에서 파생 피처 생성
def extract_datetime_features(df):
    df = df.copy()
    dt = pd.to_datetime(df["발생일시"], errors="coerce")
    df["발생_월"] = dt.dt.month
    df["발생_요일"] = dt.dt.dayofweek  # 0=월 ~ 6=일

    def parse_hour(t):
        try:
            t = str(t).strip()
            if ":" in t:
                return int(t.split(":")[0].replace(" ", "")[-2:])
        except Exception:
            pass
        return np.nan

    df["발생_시간대"] = df["발생시간"].apply(parse_hour)
    return df

df = extract_datetime_features(df)

# 사용할 피처 = 전체 - 사고후기록 - 상수 - 원본날짜
exclude = set(POST_INCIDENT_COLS) | set(CONST_COLS)
feature_cols = [c for c in df.columns if c not in exclude]

X = df[feature_cols].copy()
y = df[TARGET].copy()

print(f"\n사용 피처 수: {len(feature_cols)}")
print(f"샘플 수: {len(X)}")

# ──────────────────────────────────────────────
# 3. 범주형 / 수치형 분리 및 인코딩
# ──────────────────────────────────────────────
cat_cols = X.select_dtypes(include=["object", "string"]).columns.tolist()
num_cols = X.select_dtypes(include=["number"]).columns.tolist()

print(f"\n범주형 피처 ({len(cat_cols)}): {cat_cols}")
print(f"수치형 피처 ({len(num_cols)}개)")

# 범주형 → LabelEncoder
label_encoders = {}
for col in cat_cols:
    le = LabelEncoder()
    X[col] = X[col].fillna("_MISSING_").astype(str)
    X[col] = le.fit_transform(X[col])
    label_encoders[col] = le

# 타겟 인코딩
target_le = LabelEncoder()
y_encoded = target_le.fit_transform(y)
class_names = target_le.classes_
n_classes = len(class_names)
print(f"\n클래스 ({n_classes}): {list(class_names)}")

# ──────────────────────────────────────────────
# 4. Train / Test 분할 (8:2, stratified)
# ──────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y_encoded, test_size=0.2, random_state=SEED, stratify=y_encoded
)
print(f"\nTrain: {X_train.shape}, Test: {X_test.shape}")

# ──────────────────────────────────────────────
# 5. Optuna 하이퍼파라미터 최적화
# ──────────────────────────────────────────────
def objective(trial):
    params = {
        "objective": "multiclass",
        "num_class": n_classes,
        "metric": "multi_logloss",
        "boosting_type": "gbdt",
        "verbosity": -1,
        "seed": SEED,
        "n_jobs": -1,
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "n_estimators": trial.suggest_int("n_estimators", 100, 1000, step=50),
        "max_depth": trial.suggest_int("max_depth", 3, 12),
        "num_leaves": trial.suggest_int("num_leaves", 15, 127),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "subsample": trial.suggest_float("subsample", 0.5, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
        "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        "class_weight": "balanced",  # 클래스 불균형 대응
    }

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    scores = []

    for train_idx, val_idx in skf.split(X_train, y_train):
        X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
        y_tr, y_val = y_train[train_idx], y_train[val_idx]

        model = lgb.LGBMClassifier(**params)
        model.fit(
            X_tr, y_tr,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
        preds = model.predict(X_val)
        scores.append(f1_score(y_val, preds, average="macro"))

    return np.mean(scores)


print("\n" + "=" * 60)
print("Optuna 하이퍼파라미터 최적화 시작 (50 trials)")
print("=" * 60)

optuna.logging.set_verbosity(optuna.logging.WARNING)
study = optuna.create_study(
    direction="maximize",
    sampler=optuna.samplers.TPESampler(seed=SEED),
)
study.optimize(objective, n_trials=50, show_progress_bar=True)

print(f"\n최적 Macro F1 (CV): {study.best_value:.4f}")
print("최적 파라미터:")
for k, v in study.best_params.items():
    print(f"  {k}: {v}")

# ──────────────────────────────────────────────
# 6. 최적 파라미터로 최종 모델 학습
# ──────────────────────────────────────────────
best_params = {
    "objective": "multiclass",
    "num_class": n_classes,
    "metric": "multi_logloss",
    "boosting_type": "gbdt",
    "verbosity": -1,
    "seed": SEED,
    "n_jobs": -1,
    "class_weight": "balanced",
    **study.best_params,
}

print("\n" + "=" * 60)
print("최종 모델 학습")
print("=" * 60)

final_model = lgb.LGBMClassifier(**best_params)
final_model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
)

# ──────────────────────────────────────────────
# 7. 테스트 평가
# ──────────────────────────────────────────────
y_pred = final_model.predict(X_test)

print(f"\n테스트 Accuracy:    {accuracy_score(y_test, y_pred):.4f}")
print(f"테스트 Macro F1:    {f1_score(y_test, y_pred, average='macro'):.4f}")
print(f"테스트 Weighted F1: {f1_score(y_test, y_pred, average='weighted'):.4f}")

print("\n[Classification Report]")
print(classification_report(y_test, y_pred, target_names=class_names, zero_division=0))

# ──────────────────────────────────────────────
# 8. 피처 중요도 시각화
# ──────────────────────────────────────────────
importance = final_model.feature_importances_
feat_imp = pd.DataFrame({
    "feature": feature_cols,
    "importance": importance,
}).sort_values("importance", ascending=False)

print("\n[Top 20 피처 중요도]")
print(feat_imp.head(20).to_string(index=False))

# 시각화
fig, ax = plt.subplots(figsize=(10, 8))
top_n = min(30, len(feat_imp))
top = feat_imp.head(top_n)
ax.barh(range(len(top)), top["importance"].values, align="center")
ax.set_yticks(range(len(top)))
ax.set_yticklabels(top["feature"].values)
ax.invert_yaxis()
ax.set_xlabel("Feature Importance (split)")
ax.set_title(f"LGBM 사고유형 분류 - Top {top_n} 피처 중요도\n(사전 정보만 사용, 사고 후 기록 변수 제외)")
plt.tight_layout()
plt.savefig("feature_importance.png", dpi=150, bbox_inches="tight")
print("\n피처 중요도 차트 저장: feature_importance.png")
plt.show()

print("\n완료!")
