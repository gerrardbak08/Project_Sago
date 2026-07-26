// 현장 대응 가이드 — 현장관리자용 사고 대응 매뉴얼 (넘김 카드 덱)
// ─────────────────────────────────────────────────────────────────────────
// 전체 열람용: 카드를 넘기며 즉시조치→보고→중대재해→산재→유형별→연락처→체크리스트.
// 콘텐츠는 아래 CARDS 배열 하나로 선언 → 사내 문서 확보 시 이 배열만 교체/보강.
// 회사별로 다른 값(연락처·보고라인·지정병원)은 <TBD> 칩으로 표시 = "사내 확인 필요".
// 같은 콘텐츠가 이후 안전 도우미(챗봇)의 지식베이스가 된다.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Siren, GitBranch, ShieldAlert, FileText, Stethoscope, Phone, ClipboardCheck,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, ArrowRight, Info,
} from 'lucide-react';

// 사내 확인 필요 표시 — 회사별로 채워야 하는 값
const TBD = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 text-[11px] font-semibold align-middle">
    <Info size={11} strokeWidth={2.5} />{children || '사내 확인'}
  </span>
);

// ── 톤(색 계열) → 배지/헤더 스타일 ──
const TONES = {
  danger: { chip: 'bg-red-600 text-white', soft: 'bg-red-50', ring: 'ring-red-100', text: 'text-red-700', bar: '#D70011' },
  navy:   { chip: 'bg-brand-navy text-white', soft: 'bg-blue-50', ring: 'ring-blue-100', text: 'text-brand-navy', bar: '#071E4A' },
  amber:  { chip: 'bg-amber-500 text-white', soft: 'bg-amber-50', ring: 'ring-amber-100', text: 'text-amber-700', bar: '#D97706' },
  slate:  { chip: 'bg-stone-600 text-white', soft: 'bg-stone-50', ring: 'ring-stone-100', text: 'text-stone-700', bar: '#57534E' },
};

// ── 콘텐츠 블록 렌더러 ──
function Steps({ items, tone }) {
  const t = TONES[tone];
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className={`flex-shrink-0 w-6 h-6 rounded-full ${t.chip} grid place-items-center text-[12px] font-bold tabular-nums`}>{i + 1}</span>
          <div className="text-[13.5px] leading-relaxed text-stone-700 pt-0.5">{it}</div>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 items-start">
          <CheckCircle2 size={15} strokeWidth={2.5} className="flex-shrink-0 mt-0.5 text-emerald-600" />
          <div className="text-[13.5px] leading-relaxed text-stone-700">{it}</div>
        </li>
      ))}
    </ul>
  );
}

// 보고 흐름 (현장 → … → 경영책임자)
function Chain({ nodes }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nodes.map((n, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="rounded-lg bg-white border border-stone-200 px-2.5 py-1.5 text-[12.5px] font-semibold text-stone-700 shadow-sm">{n}</span>
          {i < nodes.length - 1 && <ArrowRight size={14} className="text-stone-400 flex-shrink-0" />}
        </span>
      ))}
    </div>
  );
}

function Contacts({ rows }) {
  return (
    <div className="flex flex-col divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${r.urgent ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'}`}>
              <Phone size={13} strokeWidth={2.5} />
            </span>
            <span className="text-[13px] font-semibold text-stone-700 truncate">{r.label}</span>
          </div>
          <span className={`text-[14px] font-bold tabular-nums flex-shrink-0 ${r.urgent ? 'text-red-600' : 'text-stone-900'}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Checklist({ items }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {items.map((it, i) => (
        <label key={i} className="flex gap-2.5 items-start cursor-pointer group">
          <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 border-stone-300 group-hover:border-brand-navy transition" />
          <span className="text-[13px] leading-relaxed text-stone-600">{it}</span>
        </label>
      ))}
    </div>
  );
}

// 경고/주의 콜아웃
function Callout({ tone = 'danger', children }) {
  const isWarn = tone === 'danger';
  return (
    <div className={`flex gap-2.5 items-start rounded-xl px-3.5 py-2.5 ${isWarn ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
      <AlertTriangle size={15} strokeWidth={2.5} className={`flex-shrink-0 mt-0.5 ${isWarn ? 'text-red-600' : 'text-amber-600'}`} />
      <div className={`text-[12.5px] leading-relaxed font-medium ${isWarn ? 'text-red-800' : 'text-amber-800'}`}>{children}</div>
    </div>
  );
}

// 소제목
const H = ({ children }) => <div className="text-[12px] font-bold text-stone-400 uppercase tracking-wide mb-2 mt-0.5">{children}</div>;

// ─────────────────────────────────────────────────────────────────────────
// 매뉴얼 카드 — 표준 초안 (산업안전보건법·중대재해처벌법 기준). 사내 문서로 보강 예정.
// ─────────────────────────────────────────────────────────────────────────
const CARDS = [
  {
    n: '01', tone: 'danger', Icon: Siren,
    title: '즉시 조치 · 골든타임',
    subtitle: '사고 발생 직후 5분, 이 순서대로',
    render: () => (
      <div className="flex flex-col gap-4">
        <Steps tone="danger" items={[
          <><b className="text-stone-900">재해자 상태 확인</b> — 의식·호흡·출혈을 살피고 말을 건다.</>,
          <><b className="text-stone-900">119 신고</b> — 의식 없음·다량 출혈·중상 의심이면 즉시. 위치와 상태를 정확히 전달.</>,
          <><b className="text-stone-900">2차 재해 차단</b> — 기계·전원을 정지하고 주변을 통제한다.</>,
          <><b className="text-stone-900">응급처치</b> — 지혈·보온. 골절·척추 의심 시 무리하게 옮기지 않는다.</>,
          <><b className="text-stone-900">즉시 보고</b> — 파트장·팀장·안전보건팀에 유선으로 먼저 알린다.</>,
        ]} />
        <Callout tone="danger">현장을 함부로 정리·훼손하지 마세요. 원인조사와 법적 증거 보존을 위해 사고 현장은 그대로 두는 것이 원칙입니다.</Callout>
      </div>
    ),
  },
  {
    n: '02', tone: 'navy', Icon: GitBranch,
    title: '보고 체계',
    subtitle: '누구에게, 언제 보고하나',
    render: () => (
      <div className="flex flex-col gap-4">
        <div><H>보고 라인</H><Chain nodes={['현장 발견자', '파트장 · 점장', '팀장', '안전보건팀', '경영책임자*']} /></div>
        <div className="text-[11.5px] text-stone-400 -mt-1">* 경영책임자 보고는 중대재해 시 필수 (카드 03)</div>
        <div>
          <H>시간 기준</H>
          <Bullets items={[
            <><b>즉시(유선)</b> — 사고를 인지한 즉시 상급자에게 알린다.</>,
            <><b>24시간 내</b> — 사고 경위서를 작성해 안전보건팀에 제출.</>,
            <><b>산재 대상</b> — 안전보건팀이 근로복지공단 신청을 지원.</>,
          ]} />
        </div>
        <div className="text-[12.5px] text-stone-500 flex items-center gap-2 flex-wrap">안전보건팀 대표 연락처 <TBD /> · 야간·휴일 비상연락망 <TBD /></div>
      </div>
    ),
  },
  {
    n: '03', tone: 'danger', Icon: ShieldAlert,
    title: '중대재해 대응',
    subtitle: '중대재해처벌법 — 지체 없이',
    render: () => (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-stone-600">
          <b className="text-stone-800">중대재해란</b> — ① 사망자 1명 이상 ② 6개월 이상 치료가 필요한 부상자 1명 이상 ③ 부상·질병자가 동시에 여러 명 발생한 경우
        </div>
        <Steps tone="danger" items={[
          <><b className="text-stone-900">즉시 작업중지</b> · 근로자 대피</>,
          <><b className="text-stone-900">119 및 관할 고용노동청 신고</b> — 지체 없이 (미신고 시 처벌 대상)</>,
          <><b className="text-stone-900">현장 보존</b> — 훼손 금지, 조사에 협조</>,
          <><b className="text-stone-900">경영책임자 즉시 보고</b></>,
        ]} />
        <Callout tone="danger">중대재해처벌법상 사업주·경영책임자는 안전보건 확보의무를 집니다. 판단이 애매하면 <b>중대재해로 간주하고</b> 안전보건팀에 즉시 연락하세요.</Callout>
        <div className="text-[12.5px] text-stone-500 flex items-center gap-2 flex-wrap">관할 고용노동지청 <TBD /> · 중대재해 비상연락망 <TBD /></div>
      </div>
    ),
  },
  {
    n: '04', tone: 'navy', Icon: FileText,
    title: '산재 · 공상 처리',
    subtitle: '치료비와 보상, 어떻게 신청하나',
    render: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
            <div className="text-[12px] font-bold text-brand-navy mb-1">산재 (요양급여)</div>
            <div className="text-[12px] leading-relaxed text-stone-600">4일 이상 요양이 필요할 때. 근로복지공단에 신청.</div>
          </div>
          <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
            <div className="text-[12px] font-bold text-stone-700 mb-1">공상</div>
            <div className="text-[12px] leading-relaxed text-stone-600">경미·단기 부상을 회사가 자체 처리.</div>
          </div>
        </div>
        <div>
          <H>처리 절차</H>
          <Steps tone="navy" items={[
            '사고 경위서 작성',
            '진단서 · 치료비 영수증 확보',
            '안전보건팀에 산재 신청 접수',
            '근로복지공단 요양급여 신청서 제출',
          ]} />
        </div>
        <Callout tone="warn">산재/공상 판단은 임의로 하지 말고 반드시 안전보건팀과 상의하세요. 공상 처리 기준 <TBD /> · 지정병원 <TBD /></Callout>
      </div>
    ),
  },
  {
    n: '05', tone: 'amber', Icon: Stethoscope,
    title: '사고 유형별 초기대응',
    subtitle: '매장에서 자주 나는 유형 기준',
    render: () => (
      <div className="flex flex-col gap-4">
        <Bullets items={[
          <><b>넘어짐 · 미끄러짐</b> — 무리한 기립 금지. 골절 의심 시 그 자세로 고정.</>,
          <><b>끼임 · 절단</b> — 전원 차단 후 구출. 절단 부위는 생리식염수·얼음에 보존해 함께 이송.</>,
          <><b>부딪힘 · 낙하물</b> — 머리·척추 충격이면 이동을 최소화.</>,
          <><b>화상</b> — 흐르는 물에 15분 이상. 물집을 터뜨리지 않는다.</>,
          <><b>근골격계(반복작업·중량물)</b> — 작업 중단·냉찜질. 무리한 스트레칭 금지.</>,
          <><b>베임</b> — 지혈·소독. 깊은 상처는 봉합이 필요하니 병원으로.</>,
        ]} />
        <Callout tone="warn">경미해 보여도 안전보건팀에 반드시 보고하세요. 초기에 가볍던 상해가 지연되어 악화되는 경우가 많습니다.</Callout>
      </div>
    ),
  },
  {
    n: '06', tone: 'slate', Icon: Phone,
    title: '긴급 연락처',
    subtitle: '사고 시 바로 거는 번호',
    render: () => (
      <div className="flex flex-col gap-3">
        <Contacts rows={[
          { label: '소방 · 응급 (화재·구조·구급)', value: '119', urgent: true },
          { label: '경찰', value: '112' },
          { label: '근로복지공단', value: '1588-0075' },
          { label: '고용노동부 고객상담', value: '1350' },
          { label: '안전보건팀', value: '사내 확인' },
          { label: '지정병원', value: '사내 확인' },
          { label: '야간·휴일 비상연락망', value: '사내 확인' },
        ]} />
        <div className="text-[11.5px] text-stone-400 flex items-center gap-1.5"><Info size={12} /> ‘사내 확인’ 항목은 회사 정보 확정 후 채워집니다.</div>
      </div>
    ),
  },
  {
    n: '07', tone: 'slate', Icon: ClipboardCheck,
    title: '보고서 · 체크리스트',
    subtitle: '보고 전 이것만 확인',
    render: () => (
      <div className="flex flex-col gap-4">
        <div>
          <H>초기대응 체크</H>
          <Checklist items={[
            '재해자 구호 완료', '119 신고 (필요 시)', '2차 재해 차단', '상급자 보고', '현장 보존', '경위서 작성',
          ]} />
        </div>
        <div>
          <H>사고 보고 필수 항목</H>
          <Checklist items={[
            '일시 · 장소(매장)', '재해자(성명 · 소속)', '사고 유형 · 경위', '상해 부위 · 정도', '목격자', '조치 사항 · 병원 이송 여부',
          ]} />
        </div>
        <div className="text-[12.5px] text-stone-500 flex items-center gap-2 flex-wrap">표준 사고 보고서 양식 <TBD /></div>
      </div>
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────
export default function FieldResponseGuide() {
  const [i, setI] = useState(0);
  const touchX = useRef(null);
  const last = CARDS.length - 1;

  const go = useCallback((d) => setI((p) => Math.min(last, Math.max(0, p + d))), [last]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  const card = CARDS[i];
  const t = TONES[card.tone];

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Siren size={18} className="text-red-600" strokeWidth={2.5} />
          <h2 className="text-[17px] font-extrabold text-stone-900">현장 대응 가이드</h2>
        </div>
        <p className="text-[12.5px] text-stone-500 mt-1">사고가 났을 때 현장관리자가 알아야 할 대응 절차 — 카드를 넘기며 확인하세요.</p>
      </div>

      {/* 진행 점 + 카운터 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {CARDS.map((c, idx) => (
            <button key={c.n} onClick={() => setI(idx)} aria-label={c.title}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-brand-navy' : 'w-1.5 bg-stone-300 hover:bg-stone-400'}`} />
          ))}
        </div>
        <span className="text-[12px] font-semibold text-stone-400 tabular-nums">{i + 1} / {CARDS.length}</span>
      </div>

      {/* 카드 */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        className="relative rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden select-none">
        <div className="h-1" style={{ background: t.bar }} />
        <div className="p-5 sm:p-6">
          {/* 카드 헤더 */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className={`w-12 h-12 rounded-2xl grid place-items-center flex-shrink-0 ${t.soft} ring-4 ${t.ring}`}>
              <card.Icon size={22} strokeWidth={2.2} className={t.text} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-black tabular-nums ${t.text}`}>{card.n}</span>
                <h3 className="text-[17px] font-extrabold text-stone-900 leading-tight">{card.title}</h3>
              </div>
              <p className="text-[12.5px] text-stone-500 mt-0.5">{card.subtitle}</p>
            </div>
          </div>
          {/* 카드 본문 */}
          <div className="min-h-[240px]">{card.render()}</div>
        </div>
      </div>

      {/* 이전 / 다음 */}
      <div className="flex items-center justify-between mt-4">
        <button onClick={() => go(-1)} disabled={i === 0}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition active:opacity-75">
          <ChevronLeft size={16} /> 이전
        </button>
        {i < last ? (
          <button onClick={() => go(1)}
            className="inline-flex items-center gap-1 px-5 py-2 rounded-xl text-[13px] font-bold text-white bg-brand-navy hover:opacity-90 transition active:opacity-75">
            다음 <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={() => setI(0)}
            className="inline-flex items-center gap-1 px-5 py-2 rounded-xl text-[13px] font-bold text-white bg-emerald-600 hover:opacity-90 transition active:opacity-75">
            <CheckCircle2 size={16} /> 처음으로
          </button>
        )}
      </div>

      {/* 챗봇 예고 */}
      <div className="mt-5 rounded-xl bg-stone-50 border border-stone-200 px-4 py-3 flex items-center gap-3">
        <span className="text-[13px] text-stone-500">전부 볼 여력이 없을 땐?</span>
        <span className="text-[13px] font-semibold text-brand-navy">곧 ‘안전 도우미’가 상황을 물어보고 바로 안내합니다.</span>
      </div>
    </div>
  );
}
