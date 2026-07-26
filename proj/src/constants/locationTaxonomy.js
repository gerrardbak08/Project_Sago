// === 발생 장소 카테고리 체계 (단일 출처) ===
// 원본DB에 '장소' 필드가 없어 사고경위 서술문에서 규칙기반으로 발생 장소를 추출한다.
// - causeTaxonomy 와 동일 원칙: 결정론적·투명·감사가능(LLM 미사용). 순수함수라 동일입력=동일출력.
// - 배열 순서 = 매칭 우선순위. 구체 장소(계단·화장실)가 포괄 장소(매장·통로)보다 앞.
// - 무매치 = '장소불명'(matched:false) — 서술문에 행동만 있고 장소가 없는 건이 약 24% 실측 존재.
//   비례추정 배지 금지 방침에 따라 별도 caveat 없이 라벨('장소 확인 N건 기준')로만 구분한다.
// - 646건 근로자 서술문 실측 기반으로 키워드 접지(2026-07). '출퇴근' 유형은 서술문과 무관하게 고정.

import { canonType } from './causeTaxonomy.js';

export const LOCATION_RULES = [
  { id: 'stairs',    label: '계단',             keywords: ['계단'] },
  { id: 'restroom',  label: '화장실',           keywords: ['화장실', '세면대'] },
  { id: 'parking',   label: '주차장',           keywords: ['주차장', '주차타워'] },
  { id: 'elevator',  label: '승강설비',         keywords: ['엘리베이터', '에스컬레이터', '승강기', '리프트', '무빙워크'] },
  { id: 'dock',      label: '상하차·검품장',    keywords: ['상하차', '하차', '입고', '검수', '검품', '배송차', '트럭', '짐차', '물류', '택배'] },
  { id: 'backroom',  label: '창고·후방',        keywords: ['창고', '후방', '백룸', '자재실'] },
  { id: 'counter',   label: '계산대',           keywords: ['계산대', '카운터', '캐셔', '포스', 'POS'] },
  { id: 'office',    label: '사무실',           keywords: ['사무실'] },
  { id: 'disposal',  label: '매장 외부·폐기장', keywords: ['폐지', '파지', '분리수거', '폐기', '매장 외', '건물 측면', '외부'] },
  { id: 'salesfloor', label: '매장·매대',       keywords: ['매대', '진열', '곤도라', '쇼케이스', '판매장', '매장 내', '매장내', '매장에서', '행사대', '평대', '집기', '선반', '훅'] },
  { id: 'aisle',     label: '통로·바닥',        keywords: ['통로', '복도', '바닥', '경사로'] },
  { id: 'ladder',    label: '사다리 위',        keywords: ['사다리', '발판', '스텝퍼', '디딤대'] },
  { id: 'road',      label: '도로·외부이동',    keywords: ['출근', '퇴근', '도로', '횡단보도', '버스', '지하철', '자택', '자전거', '오토바이', '빙판'] },
];

export const LOC_COMMUTE = { id: 'commute', label: '도로(출퇴근)' };
export const LOC_UNKNOWN = { id: 'unknown', label: '장소불명' };

// 발생 장소 분류. 반환: { id, label, matched(boolean) }
export function classifyLocation(type, causeObject, content) {
  if (canonType(type) === '출퇴근') return { ...LOC_COMMUTE, matched: true };
  const hay = `${content || ''} ${causeObject || ''}`;
  for (const r of LOCATION_RULES) {
    if (r.keywords.some((k) => hay.includes(k))) return { id: r.id, label: r.label, matched: true };
  }
  return { ...LOC_UNKNOWN, matched: false };
}
