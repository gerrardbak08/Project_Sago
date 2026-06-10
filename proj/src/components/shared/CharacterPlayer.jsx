/**
 * CharacterPlayer — 다이소 근로자 캐릭터 재생기
 *
 * .riv(Rive 애니메이션)가 있으면 사고유형별 모션 재생,
 * 없으면 정지 PNG(시나리오별 표정/포즈)로 자동 폴백.
 *
 * Rive 작업 전에도 서비스가 돌아가도록 설계 — 애니메이터가 daiso_worker.riv 를
 * proj/public/character/ 에 넣는 순간 모션이 자동 활성화된다.
 *
 * props:
 *   accident   : scenario slug (slip/fall/collision/cut/strain/health/property/claim/default/safe)
 *   size       : px (기본 200)
 *   fallbackSrc: 정지컷 PNG 경로 override (기본 /character/still/{accident}.png)
 */
import { useEffect, useState } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

const RIV_SRC = '/character/daiso_worker.riv';
const STATE_MACHINE = 'accident';

// scenario slug → Rive trigger 이름 (scenario_expression_map.json 과 일치)
const TRIGGER = {
  slip: 'slip', fall: 'fall', collision: 'collision', cut: 'cut',
  strain: 'strain', health: 'health', property: 'property',
  claim: 'claim', default: 'default', safe: 'idle_safe',
};

export default function CharacterPlayer({ accident = 'default', size = 200, fallbackSrc }) {
  const [rivAvailable, setRivAvailable] = useState(null); // null=확인중, true/false

  // .riv 파일 존재 여부 사전 확인 (없으면 폴백)
  useEffect(() => {
    let alive = true;
    fetch(RIV_SRC, { method: 'HEAD' })
      .then(r => { if (alive) setRivAvailable(r.ok); })
      .catch(() => { if (alive) setRivAvailable(false); });
    return () => { alive = false; };
  }, []);

  const { rive, RiveComponent } = useRive(
    rivAvailable
      ? { src: RIV_SRC, stateMachines: STATE_MACHINE, autoplay: true }
      : null
  );

  const trig = useStateMachineInput(rive, STATE_MACHINE, TRIGGER[accident] || 'default');
  useEffect(() => { if (trig) trig.fire(); }, [trig, accident]);

  // 폴백: 정지 PNG
  if (rivAvailable === false) {
    const src = fallbackSrc || `/character/still/${accident}.png`;
    return (
      <img src={src} alt={`안전 캐릭터 — ${accident}`}
        width={size} height={size}
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={(e) => { e.currentTarget.src = '/character/still/default.png'; }} />
    );
  }
  if (rivAvailable === null) {
    return <div style={{ width: size, height: size }} />; // 확인 중 placeholder
  }
  return <RiveComponent style={{ width: size, height: size }} />;
}
