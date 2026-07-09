// liveSnapshot.js 두 버전을 bakedAt(타임스탬프) 제외하고 비교.
// 실데이터(rows/approvalRows) 변경 시에만 '1', 아니면 '0' 을 stdout 으로 출력.
// 스케줄 bake 가 매번 bakedAt 만 바뀌어 무의미한 배포를 유발하지 않도록 CI 게이트로 사용.
//   사용: node scripts/detect-snapshot-change.mjs <prev.js> <cur.js>
import fs from 'fs';

function stripBakedAt(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(/const LIVE_SNAPSHOT = (\{[\s\S]*\});\s*export default/);
  if (!m) throw new Error(`parse fail: ${p}`);
  const o = JSON.parse(m[1]);
  delete o.bakedAt;
  return JSON.stringify(o);
}

const [prev, cur] = process.argv.slice(2);
let changed;
try {
  changed = stripBakedAt(prev) !== stripBakedAt(cur);
} catch {
  changed = true; // prev 없음/파싱실패 → 안전하게 변경으로 간주
}
process.stdout.write(changed ? '1' : '0');
