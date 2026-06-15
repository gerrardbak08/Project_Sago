import { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Bell, BarChart2, ChevronRight, Zap, Sun, Moon, Database, Cpu } from 'lucide-react';
import DAISO_LOGO from '../../data/logo.js';

/* ═══════════════════════════════════════════════
   CSS 인젝션
═══════════════════════════════════════════════ */
const CSS = `
/* ── 애니메이션 키프레임 ── */
@keyframes lp-gradmove  { to { background-position: 300% 0; } }
@keyframes lp-blurIn    { from{opacity:0;filter:blur(12px)} to{opacity:1;filter:blur(0)} }
@keyframes lp-clipIn    { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
@keyframes lp-popIn     { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
@keyframes lp-slideUp   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
@keyframes lp-ripple    { to{transform:scale(5);opacity:0} }
@keyframes lp-shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes lp-glow-dark { 0%,100%{box-shadow:0 4px 24px rgba(215,0,17,.28)} 50%{box-shadow:0 4px 44px rgba(215,0,17,.60)} }
@keyframes lp-glow-light{ 0%,100%{box-shadow:0 4px 20px rgba(215,0,17,.22)} 50%{box-shadow:0 4px 36px rgba(215,0,17,.45)} }
@keyframes lp-pulse-ring{ 0%{transform:scale(1);opacity:.45} 100%{transform:scale(1.65);opacity:0} }
@keyframes lp-float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes lp-particle  { 0%{transform:translateY(0) scale(1);opacity:.55} 100%{transform:translateY(-120px) scale(.25);opacity:0} }

/* ── Orbit ── */
@keyframes lp-orbit-spin    { from{transform:rotate(0deg)}   to{transform:rotate(360deg)}  }
@keyframes lp-orbit-counter { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }

/* ── Flow connector ── */
@keyframes lp-flow-pulse { 0%,100%{opacity:.28} 50%{opacity:.7} }

/* ── Aurora 드리프트 (4방향) ── */
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

/* ── 언더라인 hover reveal ── */
.lp-feat-title { position:relative; display:inline-block; cursor:default; }
.lp-feat-title::after {
  content:""; position:absolute; left:0; bottom:-3px;
  height:2px; width:100%;
  background:var(--lp-feat-color, #6366F1);
  transform:scaleX(0); transform-origin:left;
  transition:transform .28s ease;
}
.lp-feature:hover .lp-feat-title::after { transform:scaleX(1); }

/* ── 카드 hover (다크/라이트 각각 CSS 변수로 제어) ── */
.lp-feature { transition:border-color .22s, background .22s; }

/* ── CTA ── */
.lp-cta { transition:all .22s ease; }
.lp-cta:active { transform:translateY(0) scale(.97)!important; }

/* ── 리플 ── */
.lp-ripple-ink {
  position:absolute; border-radius:999px;
  background:rgba(255,255,255,.5);
  transform:scale(0);
  animation:lp-ripple .72s ease-out forwards;
  pointer-events:none;
}

/* ── 모드 전환 부드럽게 ── */
.lp-root { transition: background .5s ease; }
.lp-card { transition: background .4s ease, border-color .4s ease, transform .22s ease, box-shadow .22s ease; }

/* ── 테마 토글 버튼 ── */
.lp-theme-btn {
  position:absolute; top:20px; right:20px;
  width:40px; height:40px; border-radius:50%; border:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition: background .3s, color .3s, transform .2s;
  z-index:10;
}
.lp-theme-btn:hover { transform:scale(1.1) rotate(15deg); }

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
    bg:               'linear-gradient(145deg, #0F0F0E 0%, #1C1917 45%, #0C1A3A 100%)',
    text:             'white',
    subtext:          'rgba(255,255,255,.44)',
    cardBg:           'rgba(255,255,255,.06)',
    cardBorder:       'rgba(255,255,255,.12)',
    cardHoverBg:      'rgba(255,255,255,.11)',
    cardHoverBorder:  'rgba(255,255,255,.22)',
    featTitle:        'white',
    featDesc:         'rgba(255,255,255,.42)',
    footer:           'rgba(255,255,255,.16)',
    logoFilter:       'brightness(0) invert(1)',
    toggleBg:         'rgba(255,255,255,.10)',
    toggleColor:      'rgba(255,255,255,.7)',
    badgeBg:          'rgba(215,0,17,.13)',
    badgeBorder:      'rgba(215,0,17,.30)',
    glowAnim:         'lp-glow-dark 3s ease-in-out 1.6s infinite',
    aurora: [
      { color:'rgba(215,0,17,.13)',  size:580, top:'-22%', right:'-18%', anim:'lp-aurora-a 18s ease-in-out infinite' },
      { color:'rgba(99,102,241,.10)',size:500, bottom:'-22%', left:'-16%', anim:'lp-aurora-b 22s ease-in-out 3s infinite' },
      { color:'rgba(8,145,178,.08)', size:380, top:'45%',  right:'5%',    anim:'lp-aurora-c 15s ease-in-out 6s infinite' },
      { color:'rgba(180,83,9,.07)',  size:320, top:'10%',  left:'5%',     anim:'lp-aurora-d 20s ease-in-out 1s infinite' },
    ],
    particle: ['rgba(215,0,17,.42)','rgba(99,102,241,.36)','rgba(255,255,255,.20)'],
  },
  light: {
    bg:               'linear-gradient(145deg, #F8FAFF 0%, #FFFFFF 50%, #EEF2FF 100%)',
    text:             '#1C1917',
    subtext:          '#78716C',
    cardBg:           'rgba(255,255,255,.88)',
    cardBorder:       'rgba(0,0,0,.08)',
    cardHoverBg:      'rgba(255,255,255,.99)',
    cardHoverBorder:  'rgba(0,0,0,.16)',
    featTitle:        '#1C1917',
    featDesc:         '#78716C',
    footer:           '#A8A29E',
    logoFilter:       'none',
    toggleBg:         'rgba(0,0,0,.07)',
    toggleColor:      '#44403C',
    badgeBg:          'rgba(215,0,17,.07)',
    badgeBorder:      'rgba(215,0,17,.22)',
    glowAnim:         'lp-glow-light 3s ease-in-out 1.6s infinite',
    aurora: [
      { color:'rgba(215,0,17,.07)',  size:600, top:'-22%', right:'-18%', anim:'lp-aurora-a 18s ease-in-out infinite' },
      { color:'rgba(99,102,241,.06)',size:520, bottom:'-22%', left:'-16%', anim:'lp-aurora-b 22s ease-in-out 3s infinite' },
      { color:'rgba(8,145,178,.05)', size:400, top:'45%',  right:'5%',    anim:'lp-aurora-c 15s ease-in-out 6s infinite' },
      { color:'rgba(180,83,9,.05)',  size:330, top:'10%',  left:'5%',     anim:'lp-aurora-d 20s ease-in-out 1s infinite' },
    ],
    particle: ['rgba(215,0,17,.22)','rgba(99,102,241,.18)','rgba(0,0,0,.10)'],
  },
};

/* ── 사고유형 Orbit 배경 ── */
const ORBIT_DOTS = [
  '#D70011', '#F59E0B', '#6366F1', '#0891B2', '#10B981', '#8B5CF6',
];

function OrbitBg({ isDark }) {
  const R = 148;
  const opacity = isDark ? 0.18 : 0.10;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      width: R * 2, height: R * 2,
      marginTop: -R, marginLeft: -R,
      animation: 'lp-orbit-spin 64s linear infinite',
      pointerEvents: 'none', zIndex: 0,
    }}>
      {/* 궤도 링 */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: `1px dashed rgba(0,0,0,${isDark ? 0.12 : 0.07})`,
      }} />
      {ORBIT_DOTS.map((color, i) => {
        const angle = (i / ORBIT_DOTS.length) * 2 * Math.PI;
        const x = R * Math.cos(angle);
        const y = R * Math.sin(angle);
        return (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: 8, height: 8,
            marginTop: -4, marginLeft: -4,
            borderRadius: '50%',
            background: color,
            opacity,
            transform: `translate(${x}px, ${y}px)`,
            animation: 'lp-orbit-counter 64s linear infinite',
          }} />
        );
      })}
    </div>
  );
}

/* ── 3단계 플로우 다이어그램 ── */
const FLOW_STEPS = [
  { icon: Database, label: '데이터 수집', sub: '사고·날씨·물동량', color: '#6366F1' },
  { icon: Cpu,      label: 'AI 분석',    sub: '위험점수 산출',    color: '#D70011' },
  { icon: Bell,     label: '카카오 알림', sub: '선제 발송',        color: '#0891B2' },
];

function FlowDiagram({ th, visible }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 0, marginBottom: 36, width: '100%',
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(10px)',
      transition: 'opacity .6s ease .2s, transform .6s ease .2s',
    }}>
      {FLOW_STEPS.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {/* Step node */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: s.color + '14',
              border: `1px solid ${s.color}26`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <s.icon size={16} color={s.color} strokeWidth={1.8} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.featTitle, lineHeight: 1.3 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: th.subtext, marginTop: 2 }}>{s.sub}</div>
            </div>
          </div>
          {/* 화살표 연결선 */}
          {i < FLOW_STEPS.length - 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', paddingBottom: 24, flexShrink: 0,
            }}>
              <div style={{
                width: 20, height: 1,
                background: `linear-gradient(90deg, ${FLOW_STEPS[i].color}40, ${FLOW_STEPS[i+1].color}40)`,
                animation: 'lp-flow-pulse 2.4s ease-in-out infinite',
              }} />
              <div style={{
                width: 0, height: 0,
                borderTop: '3px solid transparent', borderBottom: '3px solid transparent',
                borderLeft: `4px solid ${FLOW_STEPS[i+1].color}50`,
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 파티클 ── */
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i, left: `${4 + (i * 4.8) % 92}%`,
  size: 1.5 + (i % 3) * 0.7, delay: (i * 0.38) % 5.5, dur: 4.5 + (i % 4) * 0.7,
}));

/* ── 피처 데이터 ── */
const FEATURES = [
  { icon: Brain,     title: 'AI 위험 예측',       color: '#6366F1', delay: 0,
    desc: '사고 이력·날씨·물동량 3축 데이터를 학습한 AI가 매일 아침 매장별 위험도를 자동 산출합니다.' },
  { icon: Bell,      title: '카카오톡 선제 알림', color: '#D70011', delay: 90,
    desc: '위험 임계치를 초과한 매장에만 맞춤 안전 수칙을 발송해 사고를 사전에 막습니다.' },
  { icon: BarChart2, title: '사고 현황 대시보드', color: '#0891B2', delay: 180,
    desc: '전국 매장의 사고 트렌드·원인·비용을 한눈에 파악하고 안전 의사결정을 지원합니다.' },
];

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

/* ── 3D 틸트 훅 ── */
function useTilt(strength = 7) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, shine: 0 });
  const onMove = useCallback((e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    setTilt({
      x: ((e.clientY - cy) / (r.height / 2)) * -strength,
      y: ((e.clientX - cx) / (r.width  / 2)) *  strength,
      shine: ((e.clientX - r.left) / r.width) * 100,
    });
  }, [strength]);
  const onLeave = useCallback(() => setTilt({ x: 0, y: 0, shine: 50 }), []);
  return [ref, tilt, onMove, onLeave];
}

/* ═══════════════════════════════════════════════
   피처 카드
═══════════════════════════════════════════════ */
function FeatureCard({ f, idx, th }) {
  const [cardRef, tilt, onMove, onLeave] = useTilt(5);
  return (
    <div
      ref={cardRef}
      className="lp-card lp-feature"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        background: th.cardBg,
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${th.cardBorder}`,
        borderRadius: 16, padding: '20px 22px',
        animation: `lp-slideUp .55s cubic-bezier(.2,.8,.3,1) ${780 + f.delay}ms both`,
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        boxShadow: tilt.x || tilt.y
          ? `0 12px 32px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.08)`
          : '0 2px 8px rgba(0,0,0,.06)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* shine 레이어 */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none',
        background: `radial-gradient(circle at ${tilt.shine}% 50%, rgba(255,255,255,.08) 0%, transparent 60%)`,
        opacity: (Math.abs(tilt.x) + Math.abs(tilt.y)) > 1 ? 1 : 0,
        transition: 'opacity .2s',
      }} />

      {/* 아이콘 */}
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: f.color + '1E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: `lp-float ${3.2 + idx * 0.4}s ease-in-out infinite`,
      }}>
        <f.icon size={20} color={f.color} strokeWidth={2} />
      </div>
      <div style={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
        <div className="lp-feat-title"
          style={{ '--lp-feat-color': f.color, fontSize: 14, fontWeight: 800,
            color: th.featTitle, marginBottom: 7,
            animation: `lp-clipIn .6s cubic-bezier(.2,.7,.3,1) ${860 + f.delay}ms both`,
          }}
        >{f.title}</div>
        <div style={{ fontSize: 13, color: th.featDesc, lineHeight: 1.72 }}>
          {f.desc}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   헤드라인 (단어 stagger + gradmove)
═══════════════════════════════════════════════ */
function AnimTitle({ th }) {
  const plain = ['사고가', '나기', '전에'];
  return (
    <h1 style={{
      fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 900,
      color: th.text, lineHeight: 1.3, letterSpacing: '-0.025em',
      margin: '0 0 18px',
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 10px',
    }}>
      {plain.map((w, i) => (
        <span key={w} style={{
          display: 'inline-block',
          animation: `lp-slideUp .5s cubic-bezier(.2,.8,.3,1) ${280 + i * 80}ms both`,
        }}>{w}</span>
      ))}
      <span style={{
        display: 'inline-block',
        background: 'linear-gradient(90deg,#ff6b6b,#ffa64d,#4dd0ff,#b06aff,#ff6b6b)',
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        animation: `lp-slideUp .5s cubic-bezier(.2,.8,.3,1) 520ms both,
                    lp-gradmove 4.5s linear 1s infinite`,
      }}>먼저 알려드립니다</span>
    </h1>
  );
}

/* ═══════════════════════════════════════════════
   메인 컴포넌트
═══════════════════════════════════════════════ */
export default function LandingPage({ onEnter }) {
  injectCss('lp-styles', CSS);

  /* 테마 */
  const [mode, setMode] = useState('light');
  const th = THEMES[mode];

  /* 오케스트레이션 타이밍 */
  const [badge,  setBadge]  = useState(false);
  const [sub,    setSub]    = useState(false);
  const [cta,    setCta]    = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setBadge(true),   80);
    const t2 = setTimeout(() => setSub(true),    680);
    const t3 = setTimeout(() => setCta(true),   1150);
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

  /* 리플 */
  const [ripples, addRipple] = useRipple();
  const handleCta = (e) => { addRipple(e); onEnter(); };

  return (
    <div
      className="lp-root"
      style={{ minHeight: '100dvh', background: th.bg,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', padding: '48px 24px',
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

      {/* ── Aurora 배경 (자연 변화 + 마우스 패럴랙스) ── */}
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
        {/* 사고유형 Orbit 배경 장식 */}
        <OrbitBg isDark={mode === 'dark'} />
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

      {/* ── 콘텐츠 ── */}
      <div style={{ maxWidth: 620, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>

        {/* 로고 */}
        <img src={DAISO_LOGO} alt="DAISO" style={{
          height: 32, filter: th.logoFilter, opacity: mode === 'dark' ? .82 : 1, marginBottom: 26,
          animation: 'lp-slideUp .6s cubic-bezier(.2,.8,.3,1) 40ms both',
          transition: 'filter .4s, opacity .4s',
        }} />

        {/* 배지 (popIn + shimmer) */}
        {badge && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: th.badgeBg, border: `1px solid ${th.badgeBorder}`,
            borderRadius: 999, padding: '5px 15px', marginBottom: 22,
            animation: 'lp-popIn .45s cubic-bezier(.2,.8,.2,1.1) both, lp-shimmer 2.8s linear 1s infinite',
            backgroundSize: '200% 100%',
          }}>
            <Zap size={11} color="#D70011" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#D70011', fontWeight: 700, letterSpacing: '.08em' }}>
              SAGO AI · 산업안전 예방 플랫폼
            </span>
          </div>
        )}

        {/* 헤드라인 */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <AnimTitle th={th} />
        </div>

        {/* 서브 카피 (blurIn) */}
        <p style={{
          fontSize: 15, color: th.subtext, lineHeight: 1.8,
          margin: '0 0 44px', textAlign: 'center', maxWidth: 420,
          wordBreak: 'keep-all', overflowWrap: 'break-word',
          opacity: sub ? undefined : 0,
          animation: sub ? 'lp-blurIn .65s ease both' : undefined,
          transition: 'color .4s',
        }}>
          AI가 전국 아성다이소 매장의 위험 신호를 매일 분석하고, 사고가 예상되는 매장에 선제 안전 알림을 발송합니다.
        </p>

        {/* 3단계 플로우 다이어그램 */}
        <FlowDiagram th={th} visible={sub} />

        {/* 피처 카드 (glassmorphism + 3D tilt + clipIn + float) */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 40 }}>
          {FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} idx={i} th={th} />)}
        </div>

        {/* CTA */}
        <div style={{
          width: '100%',
          opacity: cta ? 1 : 0,
          transform: cta ? 'none' : 'translateY(18px)',
          transition: 'opacity .5s ease, transform .5s ease',
        }}>
          <div style={{ position: 'relative' }}>
            {/* pulse ring */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              background: 'rgba(215,0,17,.20)',
              animation: 'lp-pulse-ring 2.2s cubic-bezier(.4,0,.6,1) 1.8s infinite',
              pointerEvents: 'none',
            }} />
            <button
              className="lp-cta"
              onClick={handleCta}
              style={{
                position: 'relative', overflow: 'hidden',
                width: '100%', height: 54, borderRadius: 14,
                background: '#D70011', border: 'none',
                color: 'white', fontSize: 16, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
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
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          marginTop: 28, fontSize: 11, color: th.footer,
          textAlign: 'center',
          opacity: cta ? 1 : 0,
          transition: 'opacity .6s ease .25s, color .4s',
        }}>
          © ㈜아성다이소 안전보건팀 · SAGO AI v9
        </div>
      </div>
    </div>
  );
}
