// 안전 도우미 답변 품질 평가 러너 — assistant-eval.json 을 실제 챗봇에 던져 채점한다.
// ─────────────────────────────────────────────────────────────────────────
// 실행:
//   set -a && . ./.env.production && set +a
//   AI_URL="$VITE_AI_URL" AI_API_TOKEN="$VITE_AI_API_TOKEN" node scripts/eval-assistant.mjs
//   node scripts/eval-assistant.mjs --dry     # 호출 없이 정답 계산만 검증
//   node scripts/eval-assistant.mjs --id D04  # 한 문항만
//
// 설계: 기대 수치를 파일에 박지 않고 채점 시점에 대시보드 집계에서 계산한다.
//   데이터가 늘어도 평가셋이 낡지 않는다(하드코딩 정답은 조용히 틀린 채로 통과한다).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'assistant-eval.json'), 'utf8'));

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const URL = process.env.AI_URL || process.env.VITE_AI_URL || '';
const TOKEN = process.env.AI_API_TOKEN || process.env.VITE_AI_API_TOKEN || '';

// ── 대시보드 집계(정답 원천) 준비 ──────────────────────────────
const LIVE = (await import('../src/data/liveSnapshot.js')).default;
const { buildWorkerDataFromLive } = await import('../src/utils/liveSource.js');
const CUSTOMER = (await import('../src/data/customerData.js')).default;
const storesRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/raw/stores.json'), 'utf8'));
const D = buildWorkerDataFromLive(LIVE.rows, storesRaw.data || storesRaw, { basis: 'incident' });
D.customer = CUSTOMER;

// 'kpis.y2026' / 'kind.출퇴근' / 'location.totals' 같은 경로를 값으로 해석
function resolve(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// expect 정의 → 기대값(문자열 또는 숫자)
function groundTruth(expect) {
  if (!expect) return null;
  switch (expect.type) {
    case 'number':
      return Number(resolve(D, expect.source));
    case 'topKey': {
      const o = resolve(D, expect.source) || {};
      const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : null;
    }
    case 'topField': {
      let arr = [...(resolve(D, expect.source) || [])];
      if (expect.excludeId) arr = arr.filter((x) => x.id !== expect.excludeId);
      arr.sort((a, b) => (Number(b[expect.by]) || 0) - (Number(a[expect.by]) || 0));
      return arr.length ? arr[0][expect.key] : null;
    }
    case 'compare':
      return expect.answer;
    default:
      return null;
    }
}

// 숫자가 답변 안에 등장하는지 — 천단위 콤마/억·만원 표기 허용
function containsNumber(text, n) {
  if (!Number.isFinite(n)) return false;
  const plain = String(n);
  const comma = n.toLocaleString('ko-KR');
  if (text.includes(plain) || text.includes(comma)) return true;
  if (n >= 1e8) {
    const eok = (n / 1e8).toFixed(1).replace(/\.0$/, '');
    if (text.includes(eok + '억')) return true;
  }
  if (n >= 1e4) {
    const man = Math.round(n / 1e4).toLocaleString('ko-KR');
    if (text.includes(man + '만')) return true;
  }
  return false;
}

function grade(q, answer) {
  const fails = [];
  const warns = [];
  const t = String(answer || '');

  // 1) 수치/키 정답
  const gt = groundTruth(q.expect);
  if (gt != null) {
    const ok = typeof gt === 'number' ? containsNumber(t, gt) : t.includes(String(gt));
    if (!ok) fails.push(`정답 미포함: "${gt}"`);
  }

  // 2) 반드시 포함
  for (const kw of q.mustInclude || []) {
    if (q.matchAny) break;
    if (!t.includes(kw)) fails.push(`필수 누락: "${kw}"`);
  }
  if (q.matchAny && (q.mustInclude || []).length) {
    if (!q.mustInclude.some((kw) => t.includes(kw))) {
      fails.push(`필수(택1) 전부 누락: ${q.mustInclude.join(' / ')}`);
    }
  }

  // 3) 있으면 안 되는 표현
  for (const kw of q.mustNotInclude || []) {
    if (t.includes(kw)) fails.push(`금지 표현 등장: "${kw}"`);
  }

  // 4) 권장 포함 — 경고만
  for (const kw of q.shouldInclude || []) {
    if (!t.includes(kw)) warns.push(`권장 누락: "${kw}"`);
  }

  // 5) 생명 위급 — 지정 키워드가 앞부분에 나와야 함
  if (q.firstMention) {
    const head = t.split('\n').slice(0, 3).join('\n');
    if (!head.includes(q.firstMention)) {
      fails.push(`"${q.firstMention}" 가 답변 앞부분(3줄)에 없음`);
    }
  }

  return { pass: fails.length === 0, fails, warns };
}

async function ask(question) {
  const { SAFETY_ASSISTANT_SYSTEM } = await import('../src/data/guideKnowledge.js');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-api-key': TOKEN } : {}) },
    body: JSON.stringify({
      prompt: `[현재 질문]\n${question}\n\n위 질문에 '현장 대응 가이드'에 근거해 현장에서 바로 실행할 수 있게 답하세요.`,
      system: SAFETY_ASSISTANT_SYSTEM,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  return j.text || '';
}

// ── 실행 ────────────────────────────────────────────────────────
const list = EVAL.questions.filter((q) => !ONLY || q.id === ONLY);
console.log(`안전 도우미 평가 — ${list.length}문항 (평가셋 v${EVAL.version})\n`);

// --dry: 호출 없이 (1) 채점 기준 유효성 (2) 다이제스트 정답 포함 여부를 검증.
//   (2)가 핵심이다 — 다이제스트에 정답이 없으면 모델이 아무리 좋아도 맞힐 수 없다.
//   즉 LLM 을 부르지 않고도 "이 문항은 구조적으로 실패한다"를 미리 알 수 있다.
if (DRY) {
  const { buildAssistantSystem } = await import('../src/utils/assistantContext.js');
  const sys = buildAssistantSystem(D, { basis: 'incident' });
  const digest = sys.slice(sys.indexOf('## 대시보드 데이터 다이제스트'));
  const guide = sys.slice(0, sys.indexOf('## 대시보드 데이터 다이제스트'));

  let noCriteria = 0, notGrounded = 0;
  for (const q of list) {
    const gt = groundTruth(q.expect);
    const hasCriteria = gt != null || (q.mustInclude || []).length || (q.mustNotInclude || []).length;
    if (!hasCriteria) noCriteria++;

    // 근거(grounding) 확인: data 는 다이제스트에, procedure 는 가이드 원문에 정답이 있어야 한다.
    let grounded = null;
    if (q.expect?.type === 'compare') {
      // compare 는 정답 단어('증가')가 아니라 비교할 두 수치가 다이제스트에 있으면 도출 가능하다.
      grounded = (q.expect.sources || []).every((src) => {
        const v = resolve(D, src);
        return typeof v === 'number' ? containsNumber(digest, v) : digest.includes(String(v));
      });
    } else if (gt != null) {
      grounded = typeof gt === 'number' ? containsNumber(digest, gt) : digest.includes(String(gt));
    } else if (q.category === 'procedure' && (q.mustInclude || []).length) {
      grounded = q.mustInclude.every((kw) => guide.includes(kw));
    }
    if (grounded === false) notGrounded++;

    const mark = !hasCriteria ? '✗' : grounded === false ? '⚠' : '✓';
    const detail = gt != null ? `정답=${gt}` : '키워드 기준';
    const why = !hasCriteria ? ' ← 채점 기준 없음' : grounded === false ? ' ← 근거 미포함(구조적 실패 예상)' : '';
    console.log(`  ${mark} ${q.id} [${q.category}] ${detail}${why}`);
  }
  console.log(`\n다이제스트 ${digest.length}자 · 가이드 ${guide.length}자`);
  console.log(noCriteria ? `✗ 채점 기준 없는 문항 ${noCriteria}건` : '✓ 전 문항 채점 가능');
  console.log(notGrounded ? `⚠ 근거 미포함 ${notGrounded}건 — 다이제스트/가이드 보강 필요` : '✓ 전 문항 근거 확보');
  process.exit(noCriteria || notGrounded ? 1 : 0);
}

if (!URL) {
  console.error('AI_URL(또는 VITE_AI_URL) 환경변수가 필요합니다. 정답 계산만 보려면 --dry 를 쓰세요.');
  process.exit(2);
}

const results = [];
for (const q of list) {
  let answer = '', err = null;
  try {
    answer = await ask(q.q);
  } catch (e) {
    err = e.message;
  }
  if (err) {
    results.push({ q, pass: false, fails: [`호출 실패: ${err}`], warns: [], answer: '' });
    console.log(`✗ ${q.id} [${q.category}] ${q.q}\n    호출 실패: ${err}`);
    continue;
  }
  const g = grade(q, answer);
  results.push({ q, ...g, answer });
  console.log(`${g.pass ? '✓' : '✗'} ${q.id} [${q.category}] ${q.q}`);
  for (const f of g.fails) console.log(`    ✗ ${f}`);
  for (const w of g.warns) console.log(`    · ${w}`);
}

// ── 요약 ────────────────────────────────────────────────────────
const wSum = (arr) => arr.reduce((s, r) => s + (r.q.weight || 1), 0);
const passed = results.filter((r) => r.pass);
const byCat = {};
for (const r of results) {
  const c = (byCat[r.q.category] ||= { n: 0, p: 0 });
  c.n++; if (r.pass) c.p++;
}
console.log('\n── 요약 ──');
console.log(`통과: ${passed.length}/${results.length}건 · 가중 ${wSum(passed)}/${wSum(results)}점`);
for (const [c, v] of Object.entries(byCat)) console.log(`  ${c}: ${v.p}/${v.n}`);

// 치명(weight 3) 실패는 별도 표시 — 사람이 다칠 수 있는 오답
const critical = results.filter((r) => !r.pass && r.q.weight === 3);
if (critical.length) {
  console.log(`\n🚨 치명 문항 실패 ${critical.length}건 — ${critical.map((r) => r.q.id).join(', ')}`);
}

const outPath = path.join(__dirname, '../.eval-report.json');
fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), results: results.map(r => ({ id: r.q.id, pass: r.pass, fails: r.fails, warns: r.warns, answer: r.answer })) }, null, 2));
console.log(`\n리포트: ${outPath}`);
process.exit(critical.length ? 1 : 0);
