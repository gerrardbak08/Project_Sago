# GitHub 첫 push 가이드

이 문서는 **현재 로컬 git 저장소를 GitHub에 처음 올릴 때** 따라할 단계입니다.

## 0. 사전 점검

- [x] `git remote`가 비어 있음 — 외부 push된 적 없음, 안전하게 정리 가능
- [x] `.gitignore` 강화 완료 — DB/, processed/, *.tfstate, .env* 등 제외
- [x] 인덱스에 추적 중인 민감 파일 13개 확인됨

## 1. 인덱스에서 민감 파일 제거 (로컬 파일은 유지)

```bash
# 프로젝트 루트에서 실행
cd "/Users/gerrard/Library/CloudStorage/OneDrive2-개인/바탕 화면/사고현황 대시보드 구축/sago_ai/sago_ai"

# Terraform state (인프라 시크릿 노출 위험)
git rm --cached infra/terraform.tfstate.*.backup

# Workspace state도 인덱스에 있으면 제거
git rm --cached -r infra/terraform.tfstate.d 2>/dev/null || true

# 환경변수 (운영 URL/secret)
git rm --cached proj/.env.development proj/.env.production

# 사고·매장 데이터 (개인정보 포함)
git rm --cached processed/incidents_cust.csv processed/incidents_emp.csv processed/stores.csv processed/weather.csv
git rm --cached stores.json

# 확인
git status -s | head -30
```

**중요**: `git rm --cached`는 *인덱스에서만* 제거. 로컬 파일은 그대로 남습니다.

## 2. .env 백업 (혹시 모를 사고 대비)

```bash
# 원본 환경변수를 안전한 곳에 백업
cp proj/.env.production ~/Documents/sago-env-production.backup
cp proj/.env.development ~/Documents/sago-env-development.backup
echo "✓ 백업 완료 — ~/Documents/sago-env-*.backup"
```

운영에서 사용할 환경변수 값들은 GitHub에 올리지 말고, S3 또는 .env.example 같은 *템플릿*만 올리는 것을 권장합니다.

## 3. 첫 commit 준비

```bash
# 사용자명/이메일 확인 (없으면 설정)
git config user.name "Gerrard"  # 또는 git config --global user.name "..."
git config user.email "your-email@daiso.kr"

# 그동안의 모든 변경 + 신규 .gitignore 반영
git add -A

# 상태 확인 — DB/, processed/, .env, *.tfstate가 보이면 안 됨
git status -s | grep -E "(DB/|processed/|\.env|tfstate)" && echo "⚠️ 민감 파일 발견!" || echo "✓ 깔끔"

# commit
git commit -m "feat: 안전보건 대시보드 PoC 초기 push

- React + Vite + Recharts 대시보드 (근로자/고객 사고)
- AI 안전 가이드 생성 (Bedrock + Mock fallback)
- 카카오 알림 발송 (notify Lambda)
- 동기간 비교 카드 + 매장·근로자 자동 시계열
- Terraform 인프라 정의 (S3 + Lambda + EventBridge)
- npm run data 자동화 + deploy.sh DB 갱신 단계 추가"
```

## 4. GitHub repo 생성

### 4-1. GitHub 웹에서 만들기 (간단)

1. https://github.com/new 접속
2. Repository name: `sago-ai` (또는 원하는 이름)
3. **반드시 Private 선택** (사고 데이터 산출물이 포함된 workerData.js가 있음)
4. README/license/.gitignore는 **만들지 않음** (이미 로컬에 있음)
5. "Create repository" 클릭

### 4-2. GitHub CLI로 만들기 (가능하면 더 빠름)

```bash
# gh 설치되어 있으면
gh repo create sago-ai --private --source=. --remote=origin --description "다이소 매장 안전보건 통합 대시보드"
```

## 5. 첫 push

```bash
# GitHub 웹에서 만들었다면 origin 추가
git remote add origin git@github.com:YOUR_USERNAME/sago-ai.git
# 또는 HTTPS
# git remote add origin https://github.com/YOUR_USERNAME/sago-ai.git

# 메인 브랜치 이름 확인
git branch --show-current   # main이 아니면 → git branch -M main

# 첫 push (upstream 설정)
git push -u origin main
```

## 6. 첫 push 후 확인 항목

- [ ] GitHub 웹에서 repo 열어 파일 목록 확인
- [ ] `DB/`, `processed/`, `.env*`, `*.tfstate*`가 **안 보임**
- [ ] `proj/src/data/workerData.js`는 보임 (대시보드 동작 필수)
- [ ] `infra/main.tf`는 보이지만 `infra/terraform.tfstate`는 **안 보임**
- [ ] README가 잘 표시되는지 (없으면 다음 단계에서 추가)

## 7. 운영 워크플로 (월 1회 DB 갱신 시)

```bash
# 1) DB/ 폴더에 새 엑셀 4개 교체 (로컬에서만)
# 2) 데이터 + 빌드 + S3 배포 한 번에
./deploy.sh
# (deploy.sh 내부에서 자동으로 npm run data 실행됨)

# 3) git에는 산출물 JS만 commit
git add proj/src/data/workerData.js proj/src/data/snapshots.js
git commit -m "chore: monthly data refresh (DB → workerData.js, snapshots.js)"
git push
```

DB 폴더는 git에 안 올리므로 GitHub repo만 받은 사람은 데이터 재생성 불가 — 운영자(다이소 안전보건팀)만 갱신.

## 8. (선택) 외부 협업용 .env.example

```bash
# 운영 secret을 빼고 키 이름만 노출
cat > proj/.env.example <<'EOF'
# 이 파일을 .env.production 으로 복사 후 실제 값 입력
VITE_NOTIFY_URL=
VITE_ALERTS_URL=
VITE_API_BASE=
VITE_FRONTEND_URL=
EOF
git add proj/.env.example
git commit -m "docs: add .env.example template"
```

## 9. 향후 GitHub Actions 자동화

이번 push에 `.github/workflows/regenerate-and-deploy.yml`이 함께 올라갑니다 — 향후 자동화 원하면:

1. GitHub repo Settings → Secrets and variables → Actions
2. 다음 secret 추가:
   - `AWS_DEPLOY_ROLE_ARN`
   - `S3_BUCKET` (예: `daiso-safety-v1-frontend`)
   - `CLOUDFRONT_DISTRIBUTION_ID` (CloudFront 사용 시)
3. Actions 탭에서 workflow_dispatch로 수동 trigger 또는 DB/** 변경 push 시 자동

지금은 deploy.sh 수동이 기본 — workflow 파일은 *future-ready* 상태로 둠.

---

## 빠른 참고: 한 줄 정리

```bash
# 정리 + 첫 push (한 번에)
cd "/Users/gerrard/Library/CloudStorage/OneDrive2-개인/바탕 화면/사고현황 대시보드 구축/sago_ai/sago_ai"
git rm --cached infra/terraform.tfstate.*.backup proj/.env.* processed/*.csv stores.json
git rm --cached -r infra/terraform.tfstate.d 2>/dev/null || true
git add -A
git status -s | grep -E "(\.env|tfstate)" && echo "민감 파일 잔존!" && exit 1
git commit -m "feat: 안전보건 대시보드 초기 push"
# 그 다음 GitHub에서 repo 생성 후
git remote add origin git@github.com:YOUR_USERNAME/sago-ai.git
git push -u origin main
```
