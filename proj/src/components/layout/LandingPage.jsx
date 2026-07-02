import { useState, useEffect, useRef, useCallback } from 'react';
import { Sun, Moon, Zap, ChevronRight, ExternalLink, Cloud, Store, RotateCcw, ArrowRight } from 'lucide-react';
import DAISO_LOGO from '../../data/logo.js';

/* ═══════════════════════════════════════════════
   CSS 인젝션
═══════════════════════════════════════════════ */
const CSS = `
@keyframes lp-gradmove  { to { background-position: 300% 0; } }
@keyframes lp-blurIn    { from{opacity:0;filter:blur(12px)} to{opacity:1;filter:blur(0)} }
@keyframes lp-popIn     { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
@keyframes lp-slideUp   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
@keyframes lp-ripple    { to{transform:scale(5);opacity:0} }
@keyframes lp-shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes lp-glow-dark { 0%,100%{box-shadow:0 4px 24px rgba(215,0,17,.28)} 50%{box-shadow:0 4px 44px rgba(215,0,17,.60)} }
@keyframes lp-glow-light{ 0%,100%{box-shadow:0 4px 20px rgba(215,0,17,.22)} 50%{box-shadow:0 4px 36px rgba(215,0,17,.45)} }
@keyframes lp-pulse-ring{ 0%{transform:scale(1);opacity:.45} 100%{transform:scale(1.65);opacity:0} }
@keyframes lp-float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes lp-particle  { 0%{transform:translateY(0) scale(1);opacity:.55} 100%{transform:translateY(-120px) scale(.25);opacity:0} }
@keyframes lp-flow-pulse{ 0%,100%{opacity:.28} 50%{opacity:.7} }

@keyframes lp-aurora-a {
  0%,100%{transform:translate(0,0) scale(1)}
  30%    {transform:translate(80px,50px) scale(1.12)}
  65%    {transform:translate(-40px,90px) scale(.92)}
}
@keyframes lp-aurora-b {
  0%,100%{transform:translate(0,0) scale(1)}
  25%    {transform:translate(-70px,-40px) scale(1.08)}
  60%    {transform:translate(50px,-80px) scale(.95)}
}
@keyframes lp-aurora-c {
  0%,100%{transform:translate(0,0) scale(1)}
  40%    {transform:translate(60px,-60px) scale(1.15)}
  75%    {transform:translate(-50px,40px) scale(.88)}
}
@keyframes lp-aurora-d {
  0%,100%{transform:translate(0,0) scale(1.05)}
  50%    {transform:translate(-80px,60px) scale(.9)}
}

.lp-root { transition: background .5s ease; }
.lp-card { transition: background .4s ease, border-color .4s ease, box-shadow .22s ease; }

.lp-theme-btn {
  position:fixed; top:20px; right:20px;
  width:40px; height:40px; border-radius:50%; border:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition: background .3s, color .3s, transform .2s;
  z-index:100;
}
.lp-theme-btn:hover { transform:scale(1.1) rotate(15deg); }

.lp-cta { transition:all .22s ease; }
.lp-cta:active { transform:translateY(0) scale(.97)!important; }

.lp-ripple-ink {
  position:absolute; border-radius:999px;
  background:rgba(255,255,255,.5);
  transform:scale(0);
  animation:lp-ripple .72s ease-out forwards;
  pointer-events:none;
}

.lp-sec-link {
  display:inline-flex; align-items:center; gap:5px;
  font-size:13.5px; font-weight:600;
  text-decoration:none; transition:opacity .18s;
}
.lp-sec-link:hover { opacity:.7; }

.lp-flow-block {
  transition: border-color .3s, background .3s, box-shadow .22s;
}
.lp-pool-card {
  transition: border-color .3s, background .3s, box-shadow .22s;
}

@media (prefers-reduced-motion:reduce){
  *{animation-duration:.001s!important;transition-duration:.001s!important;}
}
`;

function injectCss(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id; s.textContent = css;
    document.head.appendChild(s);
  }
}

/* ═══════════════════════════════════════════════
   테마 토큰
═══════════════════════════════════════════════ */
const THEMES = {
  dark: {
    bg:              'linear-gradient(145deg, #0F0F0E 0%, #1C1917 45%, #0C1A3A 100%)',
    text:            'white',
    subtext:         'rgba(255,255,255,.52)',
    subtextMd:       'rgba(255,255,255,.38)',
    cardBg:          'rgba(255,255,255,.06)',
    cardBorder:      'rgba(255,255,255,.12)',
    cardHoverBorder: 'rgba(255,255,255,.22)',
    featTitle:       'white',
    featDesc:        'rgba(255,255,255,.44)',
    footer:          'rgba(255,255,255,.16)',
    logoFilter:      'brightness(0) invert(1)',
    toggleBg:        'rgba(255,255,255,.10)',
    toggleColor:     'rgba(255,255,255,.7)',
    badgeBg:         'rgba(215,0,17,.13)',
    badgeBorder:     'rgba(215,0,17,.30)',
    glowAnim:        'lp-glow-dark 3s ease-in-out 1.6s infinite',
    divider:         'rgba(255,255,255,.10)',
    kpiBg:           'rgba(255,255,255,.05)',
    kpiBorder:       'rgba(255,255,255,.11)',
    evidBg:          'rgba(29,78,216,.09)',
    evidBorder:      'rgba(29,78,216,.22)',
    linkColor:       '#60A5FA',
    secBtn:          { bg:'rgba(255,255,255,.07)', border:'rgba(255,255,255,.18)', color:'rgba(255,255,255,.82)' },
    aurora: [
      { color:'rgba(215,0,17,.13)',  size:580, top:'-22%', right:'-18%', anim:'lp-aurora-a 18s ease-in-out infinite' },
      { color:'rgba(29,78,216,.10)', size:500, bottom:'-22%', left:'-16%', anim:'lp-aurora-b 22s ease-in-out 3s infinite' },
      { color:'rgba(8,145,178,.08)', size:380, top:'45%',  right:'5%',    anim:'lp-aurora-c 15s ease-in-out 6s infinite' },
      { color:'rgba(180,83,9,.07)',  size:320, top:'10%',  left:'5%',     anim:'lp-aurora-d 20s ease-in-out 1s infinite' },
    ],
    particle: ['rgba(215,0,17,.42)','rgba(29,78,216,.36)','rgba(255,255,255,.20)'],
  },
  light: {
    bg:              'linear-gradient(145deg, #F8FAFF 0%, #FFFFFF 50%, #EEF2FF 100%)',
    text:            '#1C1917',
    subtext:         '#57534E',
    subtextMd:       '#9CA3AF',
    cardBg:          'rgba(255,255,255,.88)',
    cardBorder:      'rgba(0,0,0,.08)',
    cardHoverBorder: 'rgba(0,0,0,.16)',
    featTitle:       '#1C1917',
    featDesc:        '#78716C',
    footer:          '#A8A29E',
    logoFilter:      'none',
    toggleBg:        'rgba(0,0,0,.07)',
    toggleColor:     '#44403C',
    badgeBg:         'rgba(215,0,17,.07)',
    badgeBorder:     'rgba(215,0,17,.22)',
    glowAnim:        'lp-glow-light 3s ease-in-out 1.6s infinite',
    divider:         'rgba(0,0,0,.08)',
    kpiBg:           'rgba(255,255,255,.90)',
    kpiBorder:       'rgba(0,0,0,.08)',
    evidBg:          'rgba(29,78,216,.05)',
    evidBorder:      'rgba(29,78,216,.18)',
    linkColor:       '#1D4ED8',
    secBtn:          { bg:'rgba(0,0,0,.04)', border:'rgba(0,0,0,.12)', color:'#44403C' },
    aurora: [
      { color:'rgba(215,0,17,.07)',  size:600, top:'-22%', right:'-18%', anim:'lp-aurora-a 18s ease-in-out infinite' },
      { color:'rgba(29,78,216,.06)', size:520, bottom:'-22%', left:'-16%', anim:'lp-aurora-b 22s ease-in-out 3s infinite' },
      { color:'rgba(8,145,178,.05)', size:400, top:'45%',  right:'5%',    anim:'lp-aurora-c 15s ease-in-out 6s infinite' },
      { color:'rgba(180,83,9,.05)',  size:330, top:'10%',  left:'5%',     anim:'lp-aurora-d 20s ease-in-out 1s infinite' },
    ],
    particle: ['rgba(215,0,17,.22)','rgba(29,78,216,.18)','rgba(0,0,0,.10)'],
  },
};

/* ── 파티클 ── */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i, left: `${4 + (i * 5.2) % 92}%`,
  size: 1.5 + (i % 3) * 0.7, delay: (i * 0.42) % 5.5, dur: 4.5 + (i % 4) * 0.8,
}));

/* ── 리플 훅 ── */
function useRipple() {
  const [ripples, setRipples] = useState([]);
  const add = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const id = Date.now();
    setRipples(p => [...p, { id, x: e.clientX - r.left - size/2, y: e.clientY - r.top - size/2, size }]);
    setTimeout(() => setRipples(p => p.filter(rp => rp.id !== id)), 730);
  }, []);
  return [ripples, add];
}

/* ── 구분선 ── */
function Divider({ th }) {
  return (
    <div style={{
      width: '100%', height: 1,
      background: th.divider,
      margin: '44px 0',
    }} />
  );
}

/* ── 섹션 레이블 ── */
function SectionLabel({ children, color = '#D70011' }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
      color, marginBottom: 10,
    }}>{children}</div>
  );
}

/* ═══════════════════════════════════════════════
   ① 히어로 타이틀
═══════════════════════════════════════════════ */
function HeroTitle({ th }) {
  const words = ['매장 안전사고,'];
  const gradient = '예측이 아니라 예방합니다';
  return (
    <h1 style={{
      fontSize: 'clamp(22px, 4.8vw, 38px)', fontWeight: 900,
      color: th.text, lineHeight: 1.25, letterSpacing: '-0.025em',
      margin: '0 0 20px', textAlign: 'center', wordBreak: 'keep-all',
    }}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: 'block',
          animation: `lp-slideUp .5s cubic-bezier(.2,.8,.3,1) ${260 + i * 80}ms both`,
        }}>{w}</span>
      ))}
      <span style={{
        display: 'inline-block',
        background: 'linear-gradient(90deg,#D70011,#ff6b6b,#ffa64d,#1D4ED8,#D70011)',
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        animation: `lp-slideUp .5s cubic-bezier(.2,.8,.3,1) 340ms both,
                    lp-gradmove 4.5s linear 1s infinite`,
      }}>{gradient}</span>
    </h1>
  );
}

/* ═══════════════════════════════════════════════
   ② 작동 흐름 블록
═══════════════════════════════════════════════ */
function FlowBlock({ phase, color, icon: Icon, title, sub, steps, th, delay }) {
  return (
    <div
      className="lp-flow-block lp-card"
      style={{
        flex: 1, minWidth: 0,
        background: th.cardBg,
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${th.cardBorder}`,
        borderRadius: 16, padding: '20px 20px 22px',
        animation: `lp-slideUp .55s cubic-bezier(.2,.8,.3,1) ${delay}ms both`,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: color + '18',
          border: `1px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={color} strokeWidth={1.8} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color, marginBottom: 2 }}>{phase}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: th.featTitle, lineHeight: 1.2 }}>{title}</div>
        </div>
      </div>

      {/* 흐름 스텝 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              background: color + '14', border: `1px solid ${color}24`,
              borderRadius: 8, padding: '4px 9px',
              fontSize: 11, fontWeight: 700, color,
              whiteSpace: 'nowrap', wordBreak: 'keep-all',
            }}>{s}</div>
            {i < steps.length - 1 && (
              <ArrowRight size={11} color={color} style={{ opacity: 0.5, flexShrink: 0, animation: 'lp-flow-pulse 2.4s ease-in-out infinite' }} />
            )}
          </div>
        ))}
      </div>

      {/* 부제 */}
      <div style={{ fontSize: 12.5, color: th.featDesc, lineHeight: 1.68, wordBreak: 'keep-all' }}>{sub}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ③ A · B · C 풀 카드
═══════════════════════════════════════════════ */
const POOLS = [
  {
    label: 'A · 기상',
    count: 20,
    color: '#0891B2',
    title: '그날 발화한 날씨 위험',
    items: ['비·눈·폭염·강풍·한파'],
    desc: '확립된 기상학 임계값(0℃ 빙점, 33℃ 폭염) 기반 인과. 그날 미발화 시 제외.',
  },
  {
    label: 'B · 매장',
    count: 21,
    color: '#D97706',
    title: '매장 환경이 위험을 키우는 시나리오',
    items: ['창고', '일객수', '계단 등'],
    desc: '통계(효과크기)로 검증, 신호 강하면 ×3 · 약하면 ×2 더 자주 노출. 계단 없는 매장엔 계단 카드 제외(필수조건).',
  },
  {
    label: 'C · 상시',
    count: 45,
    color: '#059669',
    title: '매장·날씨와 무관한 부주의 사고',
    items: ['전 매장 적용'],
    desc: '복제 없이 순차 로테이션. 매장·날씨 조건 없이 모든 매장에 균등 순환.',
  },
];

function PoolCard({ pool, th, delay }) {
  return (
    <div
      className="lp-pool-card lp-card"
      style={{
        flex: 1, minWidth: 0,
        background: th.cardBg,
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${th.cardBorder}`,
        borderRadius: 16, padding: '18px 18px 20px',
        animation: `lp-slideUp .55s cubic-bezier(.2,.8,.3,1) ${delay}ms both`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
          color: pool.color,
        }}>{pool.label}</div>
        <div style={{
          fontSize: 18, fontWeight: 900, color: pool.color, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{pool.count}<span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>개</span></div>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: th.featTitle, marginBottom: 8, wordBreak: 'keep-all', lineHeight: 1.4 }}>
        {pool.title}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
        {pool.items.map(item => (
          <span key={item} style={{
            fontSize: 10.5, background: pool.color + '14', color: pool.color,
            border: `1px solid ${pool.color}24`, borderRadius: 6, padding: '2px 7px', fontWeight: 600,
          }}>{item}</span>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: th.featDesc, lineHeight: 1.65, wordBreak: 'keep-all' }}>
        {pool.desc}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ④ KPI 수치
═══════════════════════════════════════════════ */
const KPIS = [
  { value: '86', label: '안전 시나리오', sub: '실사고 71 + 기상 추론 15' },
  { value: '20/21/45', label: 'A · B · C 풀', sub: '기상 / 매장 / 상시' },
  { value: '10%↓', label: '산재 절감 목표', sub: '전년 112건 기준' },
  { value: '0건', label: '중대재해 목표', sub: '연간 목표' },
];

function KpiGrid({ th }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 10,
      width: '100%',
    }}>
      {KPIS.map((k, i) => (
        <div
          key={k.label}
          className="lp-card"
          style={{
            background: th.kpiBg,
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${th.kpiBorder}`,
            borderRadius: 14, padding: '16px 16px',
            textAlign: 'center',
            animation: `lp-slideUp .5s cubic-bezier(.2,.8,.3,1) ${820 + i * 60}ms both`,
          }}
        >
          <div style={{
            fontSize: k.value.length > 5 ? 18 : 24, fontWeight: 900,
            color: '#D70011', lineHeight: 1.1, marginBottom: 5,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em',
          }}>{k.value}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: th.featTitle, marginBottom: 3 }}>{k.label}</div>
          <div style={{ fontSize: 10.5, color: th.subtextMd }}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   메인 컴포넌트
═══════════════════════════════════════════════ */
export default function LandingPage({ onEnter }) {
  injectCss('lp-styles', CSS);

  const [mode, setMode] = useState('light');
  const th = THEMES[mode];

  const [badge,  setBadge]  = useState(false);
  const [sub,    setSub]    = useState(false);
  const [cta,    setCta]    = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setBadge(true),   80);
    const t2 = setTimeout(() => setSub(true),    600);
    const t3 = setTimeout(() => setCta(true),   1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  /* 마우스 패럴랙스 */
  const mouse = useRef({ x: 0, y: 0 });
  const auroraRef = useRef(null);
  const rafRef = useRef(null);
  const onMouseMove = useCallback((e) => {
    mouse.current = {
      x: (e.clientX / window.innerWidth  - .5) * 2,
      y: (e.clientY / window.innerHeight - .5) * 2,
    };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        if (auroraRef.current) {
          const layers = auroraRef.current.children;
          const { x, y } = mouse.current;
          if (layers[0]) layers[0].style.transform = `translate(${x * 28}px, ${y * 18}px) scale(1)`;
          if (layers[1]) layers[1].style.transform = `translate(${-x * 22}px, ${-y * 14}px) scale(1)`;
          if (layers[2]) layers[2].style.transform = `translate(${x * 16}px, ${-y * 20}px) scale(1)`;
          if (layers[3]) layers[3].style.transform = `translate(${-x * 12}px, ${y * 22}px) scale(1)`;
        }
        rafRef.current = null;
      });
    }
  }, []);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const [ripples, addRipple] = useRipple();
  const [ripples2, addRipple2] = useRipple();
  const handleCta = (e) => { addRipple(e); onEnter(); };
  const handleCta2 = (e) => { addRipple2(e); onEnter(); };

  return (
    <div
      className="lp-root"
      style={{
        minHeight: '100dvh', background: th.bg,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
        padding: '56px 20px 64px',
      }}
      onMouseMove={onMouseMove}
    >
      {/* ── 테마 토글 ── */}
      <button
        className="lp-theme-btn"
        onClick={() => setMode(m => m === 'dark' ? 'light' : 'dark')}
        style={{ background: th.toggleBg, color: th.toggleColor }}
        title={mode === 'dark' ? '라이트 모드' : '다크 모드'}
      >
        {mode === 'dark' ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
      </button>

      {/* ── Aurora 배경 ── */}
      <div ref={auroraRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {th.aurora.map((a, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: a.size, height: a.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${a.color} 0%, transparent 70%)`,
            top: a.top, bottom: a.bottom, left: a.left, right: a.right,
            animation: a.anim,
            filter: 'blur(40px)',
            willChange: 'transform',
          }} />
        ))}
      </div>

      {/* ── 파티클 ── */}
      {PARTICLES.map(p => (
        <div key={p.id} style={{
          position: 'absolute', bottom: 0, left: p.left,
          width: p.size, height: p.size, borderRadius: '50%',
          background: th.particle[p.id % 3], pointerEvents: 'none',
          animation: `lp-particle ${p.dur}s ease-in ${p.delay}s infinite`,
        }} />
      ))}

      {/* ── 콘텐츠 래퍼 ── */}
      <div style={{
        maxWidth: 660, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', zIndex: 1,
      }}>

        {/* 로고 */}
        <img src={DAISO_LOGO} alt="DAISO" style={{
          height: 30, filter: th.logoFilter, opacity: mode === 'dark' ? .82 : 1, marginBottom: 24,
          animation: 'lp-slideUp .6s cubic-bezier(.2,.8,.3,1) 40ms both',
          transition: 'filter .4s, opacity .4s',
        }} />

        {/* ①-A 배지 */}
        {badge && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: th.badgeBg, border: `1px solid ${th.badgeBorder}`,
            borderRadius: 999, padding: '5px 14px', marginBottom: 20,
            animation: 'lp-popIn .45s cubic-bezier(.2,.8,.2,1.1) both, lp-shimmer 2.8s linear 1s infinite',
            backgroundSize: '200% 100%',
          }}>
            <Zap size={10} color="#D70011" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: '#D70011', fontWeight: 700, letterSpacing: '.1em' }}>
              SAGO AI · 산업안전 예방 플랫폼
            </span>
          </div>
        )}

        {/* ①-B 타이틀 */}
        <HeroTitle th={th} />

        {/* ①-C 리드 */}
        <p style={{
          fontSize: 14.5, color: th.subtext, lineHeight: 1.82,
          margin: '0 0 28px', textAlign: 'center', maxWidth: 520,
          wordBreak: 'keep-all', overflowWrap: 'break-word',
          opacity: sub ? undefined : 0,
          animation: sub ? 'lp-blurIn .65s ease both' : undefined,
          transition: 'color .4s',
        }}>
          과거 4년의 사고를 시나리오와 조건식으로 정의해 두고, 매일 아침 그날의 날씨·매장·날짜에 맞는 안전 카드 3장을 직원의 카카오톡으로 보냅니다. '누가 다칠지' 맞히는 것이 아니라, 매일 다른 카드로 주의를 환기(priming)해 사고를 줄입니다.
        </p>

        {/* ①-D 버튼 2개 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
          marginBottom: 48,
          opacity: cta ? 1 : 0,
          transform: cta ? 'none' : 'translateY(14px)',
          transition: 'opacity .5s ease, transform .5s ease',
        }}>
          {/* 프라이머리 CTA */}
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 12,
              background: 'rgba(215,0,17,.20)',
              animation: 'lp-pulse-ring 2.2s cubic-bezier(.4,0,.6,1) 1.8s infinite',
              pointerEvents: 'none',
            }} />
            <button
              className="lp-cta"
              onClick={handleCta}
              style={{
                position: 'relative', overflow: 'hidden',
                height: 48, padding: '0 24px', borderRadius: 12,
                background: '#D70011', border: 'none',
                color: 'white', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 7,
                zIndex: 1, animation: th.glowAnim,
              }}
              onMouseEnter={e => { e.currentTarget.style.background='#B91C1C'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='#D70011'; e.currentTarget.style.transform='none'; }}
            >
              {ripples.map(rp => (
                <span key={rp.id} className="lp-ripple-ink"
                  style={{ left:rp.x, top:rp.y, width:rp.size, height:rp.size }} />
              ))}
              대시보드 보기
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* 세컨더리 링크 */}
          <a
            href="/service-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-cta"
            style={{
              height: 48, padding: '0 20px', borderRadius: 12,
              background: th.secBtn.bg,
              border: `1px solid ${th.secBtn.border}`,
              color: th.secBtn.color, fontSize: 13.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
              textDecoration: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity='.75'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity='1'; }}
          >
            서비스 작동방식 전체 보기
            <ExternalLink size={13} strokeWidth={2} />
          </a>
        </div>

        {/* ── 구분선 ── */}
        <Divider th={th} />

        {/* ② 작동 흐름 */}
        <div style={{ width: '100%', marginBottom: 12 }}>
          <SectionLabel color="#D70011">작동 흐름 — 오프라인 → 온라인</SectionLabel>
          <div style={{ fontSize: 17, fontWeight: 800, color: th.text, marginBottom: 20, wordBreak: 'keep-all' }}>
            한 번 구축 · 매일 자동 실행
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <FlowBlock
              phase="오프라인 · 한 번 구축"
              color="#1D4ED8"
              icon={Store}
              title="사고 → 시나리오 → 조건식"
              steps={['과거 사고 429건', '86개 시나리오', '조건식 정의']}
              sub="사고를 예방수칙 기준으로 묶고, 어떤 매장·날씨일 때 더 위험한지 조건식으로 정의."
              th={th}
              delay={700}
            />
            <FlowBlock
              phase="온라인 · 매일 아침"
              color="#D70011"
              icon={Cloud}
              title="조건식 평가 → 오늘의 3장 선정"
              steps={['날씨·매장 조건식 평가', 'A·B·C 풀 라우팅', '오늘의 3장 선정']}
              sub="점수를 매기지 않고 풀로 나눠, 습관화를 막는 무상태 로테이션. 같은 매장·날씨·날짜면 항상 같은 3장(결정론적)."
              th={th}
              delay={820}
            />
          </div>
        </div>

        <Divider th={th} />

        {/* ③ A · B · C 풀 */}
        <div style={{ width: '100%', marginBottom: 12 }}>
          <SectionLabel color="#059669">A · B · C 풀 — 카드 3장 구성</SectionLabel>
          <div style={{ fontSize: 17, fontWeight: 800, color: th.text, marginBottom: 20, wordBreak: 'keep-all' }}>
            매일 다른 조합, 습관화 없는 주의 환기
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {POOLS.map((pool, i) => (
              <PoolCard key={pool.label} pool={pool} th={th} delay={700 + i * 100} />
            ))}
          </div>
          <div style={{
            marginTop: 14, fontSize: 12, color: th.subtextMd,
            textAlign: 'center', wordBreak: 'keep-all',
          }}>
            카드뉴스 형식 — 생성 이미지 + 사고원인 + 예방수칙. 이미지 생성 파이프라인 상세는 서비스 설명서 05 참조.
          </div>
        </div>

        <Divider th={th} />

        {/* ④ KPI */}
        <div style={{ width: '100%', marginBottom: 0 }}>
          <SectionLabel color="#D70011">핵심 수치</SectionLabel>
          <div style={{ fontSize: 17, fontWeight: 800, color: th.text, marginBottom: 20, wordBreak: 'keep-all' }}>
            숫자로 보는 SAGO AI
          </div>
          <KpiGrid th={th} />
        </div>

        <Divider th={th} />

        {/* ⑤ 근거 기반 */}
        <div
          className="lp-card"
          style={{
            width: '100%',
            background: th.evidBg,
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${th.evidBorder}`,
            borderRadius: 16, padding: '20px 22px',
            marginBottom: 0,
            animation: 'lp-slideUp .55s cubic-bezier(.2,.8,.3,1) 900ms both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <RotateCcw size={13} color={th.linkColor} strokeWidth={2} />
            <SectionLabel color={th.linkColor}>근거 기반 설계</SectionLabel>
          </div>
          <p style={{
            fontSize: 13.5, color: th.subtext, lineHeight: 1.78,
            margin: '0 0 14px', wordBreak: 'keep-all',
          }}>
            안전 커뮤니케이션·인지과학·생성형 AI 평가 분야의 선행 연구 12편에 근거합니다 — 시각 경고물은 위험 탐지 정확도를 +42% 높이고(Nature 2025), 매일 다른 카드는 습관화(반복 시 주의 급감)를 막으며, 강수 10mm 증가마다 당일 재해율이 +1.57% 오른다는 기상-사고 인과가 A풀 날씨 알림을 뒷받침합니다.
          </p>
          <a
            href="/service-guide.html#s8"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-sec-link"
            style={{ color: th.linkColor }}
          >
            설계 근거 12편 보기
            <ExternalLink size={12} strokeWidth={2} />
          </a>
        </div>

        <Divider th={th} />

        {/* ⑥ 하단 CTA */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: th.text, textAlign: 'center', wordBreak: 'keep-all',
          }}>
            지금 바로 현황을 확인하세요
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              background: 'rgba(215,0,17,.20)',
              animation: 'lp-pulse-ring 2.2s cubic-bezier(.4,0,.6,1) 2.2s infinite',
              pointerEvents: 'none',
            }} />
            <button
              className="lp-cta"
              onClick={handleCta2}
              style={{
                position: 'relative', overflow: 'hidden',
                width: '100%', height: 52, borderRadius: 14,
                background: '#D70011', border: 'none',
                color: 'white', fontSize: 15, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                zIndex: 1, animation: th.glowAnim,
              }}
              onMouseEnter={e => { e.currentTarget.style.background='#B91C1C'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='#D70011'; e.currentTarget.style.transform='none'; }}
            >
              {ripples2.map(rp => (
                <span key={rp.id} className="lp-ripple-ink"
                  style={{ left:rp.x, top:rp.y, width:rp.size, height:rp.size }} />
              ))}
              대시보드 보기
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          marginTop: 36, fontSize: 11, color: th.footer,
          textAlign: 'center',
          transition: 'color .4s',
        }}>
          © ㈜아성다이소 안전보건팀 · SAGO AI v9
        </div>

      </div>
    </div>
  );
}
