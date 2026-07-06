// === 재해유형별 세부원인 카테고리 체계 (단일 출처) ===
// 사고경위 서술문을 근거로 근로자·고객 사고의 "왜 그 유형이 발생했나(세부원인)"를 규칙기반으로 분류한다.
// - 결정론적·투명·감사가능(LLM 미사용). 순수함수라 동일입력=동일출력.
// - 분할기준 = 예방수칙이 다른 축 (SAGO 방법론: 사후피처추출 → 대분류 → 세부분할).
// - 키워드 배열의 순서 = 매칭 우선순위(먼저 매치되는 세부원인 채택). 무매치는 '기타'(matched:false)로 보존.
// 621건 근로자 서술문 실측 기반으로 키워드를 접지함. 고객은 원시데이터의 원인1→2→3을 정본으로 정규화.

// ─────────────────────────────────────────────────────────────
// 1. 정규화 (표기흔들림 → 정본)
// ─────────────────────────────────────────────────────────────

const TYPE_CANON_MAP = {
  '무리한동작': '무리한 동작',
};

// 재해유형 정본화: 공백흔들림·질병 4변종 통합, 빈값→기타
export function canonType(t) {
  if (t == null) return '기타';
  const s = String(t).trim();
  if (s === '') return '기타';
  if (TYPE_CANON_MAP[s]) return TYPE_CANON_MAP[s];
  if (s.startsWith('질병')) return '질병';        // 질병 / 질병(만성질환) / 질병(신체장기) / 질병 (뇌출혈 등)
  return s;
}

const CAUSE_OBJECT_MAP = {
  '반복 작업': '반복작업',   // 129 + 7 통합
  '안전칼': '칼',            // 14 + 18 통합
};

// 기인물 정본화: 알려진 표기흔들림만 병합, '-'·빈값→null
export function canonCauseObject(c) {
  if (c == null) return null;
  const s = String(c).trim();
  if (s === '' || s === '-') return null;
  return CAUSE_OBJECT_MAP[s] || s;
}

// 고객 원인 필드 정규화 (원시데이터 원인1→2→3 정본 채택)
export const CUSTOMER_NORM = {
  type(v) { if (!v) return null; const s = String(v).trim(); return s === '낙성' ? '낙상' : s; }, // 오타 3건
  c1(v) { return v ? String(v).trim() : null; },
  c2(v) {
    if (!v) return null;
    const s = String(v).trim();
    // '상품(진열상품)' → '(상품)진열상품' 형식 통일
    const m = s.match(/^([^()]+)\(([^()]+)\)$/);
    if (m) return `(${m[1]})${m[2]}`;
    return s;
  },
  c3(v) { return v ? String(v).trim() : null; },  // 선행공백 제거로 15→9종
};

// ─────────────────────────────────────────────────────────────
// 2. 근로자 재해유형(대분류) → 세부원인 (키워드 우선순)
//    매칭 대상 = (사고내용 + " " + 기인물). 배열 앞쪽 = 높은 우선순위.
// ─────────────────────────────────────────────────────────────

export const WORKER_SUBCAUSE = {
  '넘어짐': [
    { id: 'body',     label: '신체이상·실신',  keywords: ['어지', '쓰러', '현기', '실신', '힘이 풀', '힘이풀', '힘이 빠'] },
    { id: 'slip',     label: '미끄러짐',        keywords: ['미끄러', '무빙워크', '결빙', '빙판', '물기', '빗물', '젖', '경사', '내리막'] },
    { id: 'back',     label: '뒷걸음·회피',     keywords: ['뒷걸음', '뒤로 걷', '뒤로 걸', '뒤돌아', '뒤로 이동', '피하', '피다'] },
    { id: 'obstacle', label: '장애물 걸림',     keywords: ['걸려', '걸림', '걸쳐', '걸리', '스토퍼', '단차', '보도블럭', '경계석', '연석', '문턱', '바닥에', '적재'] },
    { id: 'carry',    label: '운반 중 전도',    keywords: ['밀며', '밀면서', '밀고', '밀다', '끌고', '끌면서'] },
    { id: 'misstep',  label: '헛디딤·발접질림', keywords: ['헛디', '헛딛', '헛딧', '접질', '접지', '삐끗', '중심을 잃', '무게중심', '발목', '발을 딛', '디딤', '발이 꼬', '꺾', '마지막 계단', '계단', '사다리'] },
    { id: 'roll',     label: '운반구 전도',     keywords: ['롤테이너', 'l카', 'L카'] },
  ],
  '무리한 동작': [
    { id: 'lift',   label: '들기·인양',   keywords: ['들다', '들던', '들어올', '들어 올', '들고', '들어', '인양', '중량물', '받다', '받던', '올리', '옮기', '내려놓', '내리', '교체', '적재'] },
    { id: 'push',   label: '밀기·끌기',   keywords: ['밀다', '밀며', '밀기', '밀고', '밀어', '끌', '경사로'] },
    { id: 'pull',   label: '꺼냄·당김',   keywords: ['꺼내', '당기', '당겨', '뽑', '집어', '빼', '접는', '꺾'] },
    { id: 'twist',  label: '비틀기·기립', keywords: ['일어나', '일어서', '숙였', '숙이', '숙인', '회전', '돌리', '비틀', '몸을 돌', '펴'] },
    { id: 'repeat', label: '반복·장시간 부담', keywords: ['반복', '장시간', '장기간', '누적', '근골격', '서있', '지속', '20년'] },
  ],
  '물체에 맞음': [
    { id: 'topple', label: '집기·설비 전도',   keywords: ['쓰러', '전도', '무너', '탈락', '넘어지며', '쏟아', '쏠'] },
    { id: 'top',    label: '상단 적재물 낙하', keywords: ['상단', '최상단', '상부', '선반', '렉', '랙', '훅', '위에 있', '위에있', '천장'] },
    { id: 'handle', label: '취급·전달 중 낙하', keywords: ['떨어뜨', '놓쳐', '놓치', '기사', '배송', '운전원', '하차', '내리', '옮기', '건내', '건네', '전달'] },
    { id: 'fall',   label: '낙하물 일반',     keywords: ['떨어', '낙하', '찍'] },
  ],
  '베임': [
    { id: 'knife',    label: '칼·커터',       keywords: ['칼', '커터', '작두', '칼날'] },
    { id: 'scissor',  label: '가위',          keywords: ['가위'] },
    { id: 'glass',    label: '깨진 상품·유리', keywords: ['유리', '깨진', '깨져', '조각', '화병', '디저트볼', '깨'] },
    { id: 'animal',   label: '동물',          keywords: ['고양이', '물린', '물림'] },
    { id: 'facility', label: '시설물 긁힘·마감불량', keywords: ['마감', '선반', '렉', '훅', '바훅', '튀어나온', '락카', '사물함', '긁', '스친', '스치', '모서리', '종이'] },
  ],
  '떨어짐': [
    { id: 'substitute', label: '대체물 승강(의자·박스)', keywords: ['의자', '박스를 밟', '박스를밟', '캐비넷', '밟고 올라', '밟고올라'] },
    { id: 'defect',     label: '설비 결함(발판·손잡이)', keywords: ['파손', '부러', '나사', '빠짐', '빠지', '벌어지', '불량'] },
    { id: 'ladder',     label: '사다리 승강·헛디딤',    keywords: ['사다리', '헛디', '중심을 잃', '중심이', '미끄러', '리프트'] },
    { id: 'gap',        label: '단차·틈 추락',          keywords: ['단차', '틈', '사이', '추락'] },
  ],
  '부딪힘': [
    { id: 'avoid',   label: '회피 중',        keywords: ['피하', '부딪힐뻔', '부딪힐 뻔', '피다', '주시 않'] },
    { id: 'fixed',   label: '고정 구조물 모서리', keywords: ['모서리', '매대', '평대', '기둥', '난간', '핸드레일', '스프링클러', '천장', '벽', '경량랙', '중량랙', '선반', '문'] },
    { id: 'moving',  label: '운반구·이동물',   keywords: ['롤테이너', 'l카', 'L카', '엘카', '대차', '입고차량', '차량', '파렛트', '리프트', '사다리'] },
    { id: 'product', label: '취급물(박스·상품)', keywords: ['박스', '상품', '바구니', '집기', '부자재', '자바라'] },
  ],
  '끼임': [
    { id: 'door',  label: '문·자동문',   keywords: ['자동문', '출입문', '매장문', '문틈', '셔터', '철문', '문'] },
    { id: 'roll',  label: '운반구',      keywords: ['롤테이너', 'l카', 'L카', '리프트'] },
    { id: 'shelf', label: '선반·집기',   keywords: ['선반', '부자재', '락카'] },
  ],
  '깔림': [
    { id: 'frame',   label: '프레임·투입구 압박', keywords: ['프레임', '투입구', '슈트', '압박'] },
    { id: 'lift',    label: '리프트',          keywords: ['리프트'] },
    { id: 'roll',    label: '롤테이너 전도·바퀴', keywords: ['롤테이너', '바퀴'] },
    { id: 'product', label: '적재물 압박',      keywords: ['상품', '적재', '파지'] },
  ],
  '질병': [
    { id: 'cardio', label: '뇌심혈관·실신',  keywords: ['뇌출혈', '뇌졸중', '뇌', '심장', '심근', '혈관', '쓰러', '의식', '호흡', '명치', '실신', '답답'] },
    { id: 'organ',  label: '신체장기',      keywords: ['장기', '위장', '신장', '간'] },
    { id: 'msk',    label: '근골격 반복부담', keywords: ['근골격', '반복', '허리', '요추', '손목', '어깨', '무릎', '디스크', '추간판', '통증', '부담', '관절'] },
  ],
  '출퇴근': [
    { id: 'bike', label: '자전거·이륜', keywords: ['자전거', '킥보드', '오토바이', '이륜'] },
    { id: 'car',  label: '차량',       keywords: ['차량', '버스', '승용', '운전', '차'] },
    { id: 'walk', label: '도보',       keywords: ['도보', '걷', '보행', '빙판', '계단', '길', '넘어'] },
  ],
};

// 무리한 동작·질병의 부가태그: 부상부위 (동작×부위 교차분석용). 우선순위=배열순.
export const BODYPART_RULES = [
  { id: 'back',     label: '허리',      keywords: ['허리', '요추', '요통', '골반', '추간판', '척추', '좌골'] },
  { id: 'wrist',    label: '손목',      keywords: ['손목', '손목터널'] },
  { id: 'shoulder', label: '어깨',      keywords: ['어깨', '관절와순', '견갑'] },
  { id: 'knee',     label: '무릎',      keywords: ['무릎', '연골', '슬관절'] },
  { id: 'hand',     label: '손·손가락', keywords: ['손가락', '손등', '엄지', '검지', '중지', '약지', '손바닥', '손'] },
  { id: 'neck',     label: '목',        keywords: ['목', '경추'] },
  { id: 'rib',      label: '갈비·늑골',  keywords: ['늑골', '갈비', '흉부', '가슴'] },
  { id: 'leg',      label: '다리·종아리', keywords: ['종아리', '다리', '하지', '발목', '고관절'] },
];

// ─────────────────────────────────────────────────────────────
// 3. 교차소스 행동·결과 축 (근로자↔고객 비교용 상수)
// ─────────────────────────────────────────────────────────────

export const ACTION_AXIS = {
  worker: {
    '넘어짐': '넘어짐·미끄러짐', '부딪힘': '충돌·부딪힘', '물체에 맞음': '물체·낙하',
    '깔림': '물체·낙하', '베임': '베임·자상', '떨어짐': '추락', '끼임': '끼임',
    '무리한 동작': '신체부담', '질병': '신체부담', '출퇴근': '기타', '사망': '기타', '기타': '기타',
  },
  customer: {  // 고객 원인3(행동·결과)
    '넘어짐': '넘어짐·미끄러짐', '미끄러짐': '넘어짐·미끄러짐', '충돌': '충돌·부딪힘',
    '파손': '물체·낙하', '누액': '기타', '베임': '베임·자상', '추락': '추락',
    '끼임': '끼임', '기타': '기타',
  },
};

// ─────────────────────────────────────────────────────────────
// 4. 분류기 (순수함수)
// ─────────────────────────────────────────────────────────────

function classifyBodyPart(hay) {
  for (const r of BODYPART_RULES) {
    if (r.keywords.some(k => hay.includes(k))) return r.label;
  }
  return null;
}

// 근로자 세부원인 분류.
// 반환: { type(정본), subCause(id), subCauseLabel, bodyPart|null, action, matched(boolean) }
export function classifyWorkerSubCause(type, causeObject, content) {
  const t = canonType(type);
  const hay = `${content || ''} ${canonCauseObject(causeObject) || causeObject || ''}`;
  const action = ACTION_AXIS.worker[t] || '기타';

  if (t === '사망') return { type: t, subCause: 'death', subCauseLabel: '사망', bodyPart: null, action, matched: true };

  const needsBodyPart = (t === '무리한 동작' || t === '질병');
  const bodyPart = needsBodyPart ? classifyBodyPart(hay) : null;

  const rules = WORKER_SUBCAUSE[t];
  if (rules) {
    for (const r of rules) {
      if (r.keywords.some(k => hay.includes(k))) {
        return { type: t, subCause: r.id, subCauseLabel: r.label, bodyPart, action, matched: true };
      }
    }
  }
  // 무매치 또는 규칙 없는 유형(기타 등) → '기타'로 보존
  return { type: t, subCause: 'etc', subCauseLabel: '기타', bodyPart, action, matched: false };
}
