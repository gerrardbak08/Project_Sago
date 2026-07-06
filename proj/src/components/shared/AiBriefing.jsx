// 구조화된 AI 브리핑 렌더러
// { headline, briefing:{현황,위험,권장}, insight_cards:[{title,metric,delta,tone,note}] }
// parseAiResponse() 가 반환한 객체를 받아 헤드라인 + 3부 섹션 + 인사이트 카드 그리드로 표시.
// 대시보드 토큰(레드 #D70011 · 네이비 #071E4A · SAFE_GREEN #047857) 준수.
import { BarChart3, AlertTriangle, Lightbulb } from 'lucide-react';

const NV          = '#071E4A';
const DAISO_RED   = '#D70011';
const SAFE_GREEN  = '#047857';

// tone 별 색상 토큰
const TONE_STYLE = {
  up:    { bg: '#FEF2F2', text: '#B91C1C', badgeBg: 'rgba(252,165,165,0.18)', badgeBorder: '#FCA5A5' },
  down:  { bg: '#ECFDF5', text: '#047857', badgeBg: 'rgba(110,231,183,0.18)', badgeBorder: '#6EE7B7' },
  flat:  { bg: '#FAFAF9', text: '#78716C', badgeBg: 'rgba(214,211,208,0.30)', badgeBorder: '#D6D3D1' },
  alert: { bg: '#FFF7ED', text: '#C2410C', badgeBg: 'rgba(254,215,170,0.30)', badgeBorder: '#FED7AA' },
};

// 브리핑 섹션 메타
const SECTION_META = [
  { key: '현황', Icon: BarChart3,     color: NV,         bg: '#EFF6FF', border: '#BFDBFE' },
  { key: '위험', Icon: AlertTriangle, color: DAISO_RED,  bg: '#FEF2F2', border: '#FECACA' },
  { key: '권장', Icon: Lightbulb,     color: SAFE_GREEN, bg: '#ECFDF5', border: '#A7F3D0' },
];

/**
 * @param {{ data: object|null, loading: boolean }} props
 *   data — parseAiResponse() 결과 또는 buildRuleBasedBriefingStructured() 결과
 *   loading — true 이면 스켈레톤 표시
 */
function AiBriefing({ data, loading }) {
  if (!data && !loading) return null;

  // 로딩 중이고 data가 아직 없을 때 스켈레톤
  if (loading && !data) {
    return (
      <div className="space-y-3 dash-blur-in animate-pulse">
        <div className="h-10 rounded-lg bg-stone-100" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 rounded-lg bg-stone-100" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-stone-100" />
          ))}
        </div>
      </div>
    );
  }

  const cards = data?.insight_cards || [];
  // 카드 수에 따라 그리드 열 클래스 결정
  const cardGridCls =
    cards.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' :
    cards.length === 4 ? 'grid-cols-2 sm:grid-cols-4' :
    'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';

  return (
    <div className="space-y-3 dash-blur-in">

      {/* ─── 헤드라인 카드 ─── */}
      <div
        className="rounded-lg px-4 py-3 border-l-4"
        style={{ background: '#EFF6FF', borderColor: NV }}
      >
        <p className="text-sm font-bold text-stone-900 break-keep leading-snug">
          {data?.headline}
        </p>
      </div>

      {/* ─── 3부 브리핑 섹션 ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SECTION_META.map(({ key, Icon, color, bg, border }) => (
          <div
            key={key}
            className="rounded-lg p-3 border"
            style={{ background: bg, borderColor: border }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon size={12} style={{ color }} strokeWidth={2.5} />
              <span
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color }}
              >
                {key}
              </span>
            </div>
            <p className="text-xs text-stone-700 break-keep leading-relaxed">
              {data?.briefing?.[key] || '—'}
            </p>
          </div>
        ))}
      </div>

      {/* ─── 인사이트 카드 그리드 ─── */}
      {cards.length > 0 && (
        <div className={`grid gap-2 ${cardGridCls}`}>
          {cards.map((card, i) => {
            const ts = TONE_STYLE[card.tone] || TONE_STYLE.flat;
            return (
              <div
                key={i}
                className="rounded-lg p-3 border flex flex-col gap-1 min-w-0"
                style={{ background: ts.bg, borderColor: ts.badgeBorder }}
              >
                {/* 제목 */}
                <div className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide truncate">
                  {card.title}
                </div>
                {/* 핵심 수치 */}
                <div
                  className="text-xl font-bold tabular-nums truncate leading-tight"
                  style={{ color: ts.text }}
                >
                  {card.metric}
                </div>
                {/* 증감 배지 */}
                {card.delta && (
                  <div
                    className="self-start inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-tight whitespace-nowrap"
                    style={{
                      background: ts.badgeBg,
                      color: ts.text,
                      border: `1px solid ${ts.badgeBorder}`,
                    }}
                  >
                    {card.delta}
                  </div>
                )}
                {/* 설명 */}
                <p className="text-[10px] text-stone-500 break-keep leading-snug">
                  {card.note}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { AiBriefing };
