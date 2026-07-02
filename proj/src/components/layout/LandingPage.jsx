import { useEffect, useRef, useState } from 'react';
import { CloudSun, Sparkles, ShieldCheck } from 'lucide-react';
import DAISO_LOGO from '../../data/logo.js';

// SAGO 진입 랜딩 — 다크 프리미엄·세리프 헤드라인·넉넉한 여백. 간결하게.
const RED = '#E11D2A';
const BODY_FONT = "'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif";

function injectLandingCss() {
  if (typeof document === 'undefined' || document.getElementById('sago-lp-css')) return;
  const f1 = document.createElement('link'); f1.rel = 'stylesheet';
  f1.href = 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap';
  document.head.appendChild(f1);
  const f2 = document.createElement('link'); f2.rel = 'stylesheet';
  f2.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css';
  document.head.appendChild(f2);
  const st = document.createElement('style'); st.id = 'sago-lp-css';
  st.textContent = `
    @keyframes lpUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
    @keyframes lpGlow{0%,100%{opacity:.4;transform:translateX(-50%) scale(1)}50%{opacity:.72;transform:translateX(-50%) scale(1.09)}}
    @keyframes lpDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(26px,-18px)}}
    @keyframes lpDot{0%,100%{box-shadow:0 0 0 0 rgba(225,29,42,.55)}70%{box-shadow:0 0 0 7px rgba(225,29,42,0)}}
    .lp-up{animation:lpUp .95s cubic-bezier(.2,.7,.3,1) both}
    .lp-serif{font-family:'Nanum Myeongjo',serif}
    .lp-play{font-family:'Playfair Display',serif}
    .lp-dot{animation:lpDot 2.4s ease-out infinite}
    .lp-cta{transition:transform .2s cubic-bezier(.2,.7,.3,1),box-shadow .25s,background .2s,border-color .2s}
    .lp-cta:hover{transform:translateY(-2px)}
    .lp-primary:hover{box-shadow:0 16px 44px rgba(225,29,42,.48)}
    .lp-ghost:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.32)}
    .lp-link{transition:color .18s}
    .lp-link:hover{color:#fff}
    .lp-chip{transition:transform .2s cubic-bezier(.2,.7,.3,1),background .2s,border-color .2s}
    .lp-chip:hover{transform:translateY(-2px);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2)}
    .lp-reveal{opacity:0;transform:translateY(30px);transition:opacity .8s cubic-bezier(.2,.7,.3,1),transform .8s cubic-bezier(.2,.7,.3,1)}
    .lp-reveal.in{opacity:1;transform:none}
    .lp-step{transition:transform .28s cubic-bezier(.2,.7,.3,1),border-color .28s,background .28s}
    .lp-step:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.05)}
    @media (prefers-reduced-motion: reduce){
      .lp-up,.lp-dot{animation:none!important}
      .lp-reveal{opacity:1!important;transform:none!important;transition:none!important}
    }
  `;
  document.head.appendChild(st);
}

// 스크롤 진입 시 1회 드러남 (조코딩식 순차 리빌 착안)
function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, shown];
}

const STEPS = [
  { Icon: CloudSun, no: '01', t: '매일 아침, 위험을 계산', d: '그날의 날씨와 매장 데이터로 “오늘 이 매장에서 무엇이 위험한가”를 분석합니다.' },
  { Icon: Sparkles, no: '02', t: '안전 카드 3장 생성', d: '사고 원인과 예방 수칙을, 현장이 바로 이해하는 이미지 카드로 만듭니다.' },
  { Icon: ShieldCheck, no: '03', t: '직원에게 발송 → 예방', d: '매일 아침 직원 카카오톡으로. 직원과 고객의 사고를 미리 환기합니다.' },
];

function StepCard({ step, i }) {
  const [ref, shown] = useReveal();
  const { Icon } = step;
  return (
    <div ref={ref} className={`lp-reveal ${shown ? 'in' : ''}`} style={{ transitionDelay: `${i * 130}ms` }}>
      <div className="lp-step" style={{ height: '100%', padding: '26px 24px', borderRadius: 18,
        border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.025)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            background: 'rgba(225,29,42,.12)', border: '1px solid rgba(225,29,42,.28)' }}>
            <Icon size={20} color={RED} strokeWidth={2} />
          </span>
          <span className="lp-play" style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,.16)' }}>{step.no}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 8 }}>{step.t}</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.66, color: 'rgba(255,255,255,.56)', wordBreak: 'keep-all', margin: 0 }}>{step.d}</p>
      </div>
    </div>
  );
}

export default function LandingPage({ onEnter }) {
  useEffect(() => { injectLandingCss(); }, []);
  const [headRef, headShown] = useReveal();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', color: '#fff', fontFamily: BODY_FONT,
      background: 'radial-gradient(140% 120% at 50% -8%, #0E1E3E 0%, #08132A 44%, #04091A 100%)',
    }}>
      {/* 깊이감 — 글로우 + 미세 그리드 */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '50%', width: 1040, height: 660,
          background: `radial-gradient(ellipse, ${RED}26, transparent 60%)`, filter: 'blur(18px)', animation: 'lpGlow 10s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-18%', left: '3%', width: 660, height: 660,
          background: 'radial-gradient(circle, rgba(29,78,216,.16), transparent 64%)', filter: 'blur(30px)', animation: 'lpDrift 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '24%', right: '-5%', width: 560, height: 560,
          background: 'radial-gradient(circle, rgba(14,116,144,.12), transparent 66%)', filter: 'blur(36px)', animation: 'lpDrift 21s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)',
          backgroundSize: '66px 66px',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 22%, #000 8%, transparent 74%)',
          maskImage: 'radial-gradient(ellipse at 50% 22%, #000 8%, transparent 74%)' }} />
      </div>

      {/* 상단 네비 */}
      <nav style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '24px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img src={DAISO_LOGO} alt="DAISO" style={{ height: 30, width: 'auto', borderRadius: 7, display: 'block' }} />
          <span className="lp-play" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '.01em' }}>SAGO<span style={{ color: RED }}> AI</span></span>
        </div>
        <a className="lp-link" href="/service-guide.html" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13.5, color: 'rgba(255,255,255,.55)', textDecoration: 'none', fontWeight: 500 }}>서비스 작동방식 ↗</a>
      </nav>

      {/* 히어로 */}
      <header style={{ position: 'relative', maxWidth: 940, margin: '0 auto', padding: 'clamp(50px,11vh,120px) 30px 20px', textAlign: 'center' }}>
        <div className="lp-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999,
          border: '1px solid rgba(255,255,255,.13)', background: 'rgba(255,255,255,.04)', backdropFilter: 'blur(8px)',
          fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.66)', fontWeight: 600 }}>
          <span className="lp-dot" style={{ width: 6, height: 6, borderRadius: 999, background: RED }} />
          SAGO AI · 매장 안전 예방 플랫폼
        </div>

        <h1 className="lp-serif lp-up" style={{ margin: '28px 0 0', fontSize: 'clamp(38px,6.6vw,78px)', lineHeight: 1.16, fontWeight: 800,
          letterSpacing: '-.02em', animationDelay: '.08s', wordBreak: 'keep-all' }}>
          매장 안전사고,<br /><span style={{ color: RED }}>예측이 아니라 예방</span>합니다.
        </h1>

        <p className="lp-up" style={{ margin: '30px auto 0', maxWidth: 600, fontSize: 'clamp(15px,1.55vw,18px)', lineHeight: 1.72,
          color: 'rgba(255,255,255,.6)', animationDelay: '.16s', wordBreak: 'keep-all' }}>
          매일 아침, 그날의 날씨와 매장에 맞춘 <b style={{ color: '#fff', fontWeight: 600 }}>안전 카드 3장</b>을 직원에게.<br />
          <b style={{ color: '#fff', fontWeight: 600 }}>직원의 산업재해도, 고객의 안전사고도</b> 미리 환기합니다.
        </p>

        {/* 두 축을 병렬로 — 직원(산업재해) · 고객(안전사고) */}
        <div className="lp-up" style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '.2s' }}>
          {[['직원 산업재해', RED], ['고객 안전사고', '#3B82F6']].map(([t, c]) => (
            <span key={t} className="lp-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 15px', borderRadius: 999,
              border: '1px solid rgba(255,255,255,.11)', background: 'rgba(255,255,255,.035)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.84)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: c, boxShadow: `0 0 8px ${c}` }} />
              {t} 예방
            </span>
          ))}
        </div>

        <div className="lp-up" style={{ marginTop: 40, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '.24s' }}>
          <button className="lp-cta lp-primary" onClick={onEnter}
            style={{ padding: '15px 30px', borderRadius: 13, border: 'none', cursor: 'pointer', background: RED, color: '#fff',
              fontSize: 15, fontWeight: 700, boxShadow: '0 10px 32px rgba(225,29,42,.34)', fontFamily: BODY_FONT }}>
            대시보드 보기 →
          </button>
          <a className="lp-cta lp-ghost" href="/service-guide.html" target="_blank" rel="noopener noreferrer"
            style={{ padding: '15px 26px', borderRadius: 13, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.03)',
              color: 'rgba(255,255,255,.85)', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', fontFamily: BODY_FONT }}>
            서비스 작동방식 보기
          </a>
        </div>

        {/* 핵심 지표 — 절제된 3개 */}
        <div className="lp-up" style={{ marginTop: 'clamp(58px,9vh,104px)', display: 'flex', gap: 'clamp(28px,6vw,78px)',
          justifyContent: 'center', flexWrap: 'wrap', animationDelay: '.34s' }}>
          {[['86', '안전 시나리오'], ['3장', '매일 아침 알림'], ['0', '중대재해 목표']].map(([v, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div className="lp-play" style={{ fontSize: 'clamp(30px,4.2vw,46px)', fontWeight: 600, lineHeight: 1,
                background: 'linear-gradient(180deg,#fff,rgba(255,255,255,.62))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{v}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.46)', marginTop: 8, letterSpacing: '.02em' }}>{l}</div>
            </div>
          ))}
        </div>
      </header>

      {/* 곡선 디바이더 (조코딩식 섹션 전환 착안) */}
      <div style={{ position: 'relative', marginTop: 'clamp(50px,8vh,90px)', lineHeight: 0 }}>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 70 }}>
          <path d="M0,0 C420,86 1020,86 1440,0 L1440,90 L0,90 Z" fill="rgba(255,255,255,.018)" />
          <path d="M0,0 C420,86 1020,86 1440,0" fill="none" stroke="url(#lpEdge)" strokeWidth="1.4" />
          <defs>
            <linearGradient id="lpEdge" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={RED} stopOpacity="0" />
              <stop offset="0.5" stopColor={RED} stopOpacity="0.55" />
              <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 작동 방식 — 스크롤 순차 리빌 (원문은 링크로) */}
      <section style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '10px 30px 20px' }}>
        <div ref={headRef} className={`lp-reveal ${headShown ? 'in' : ''}`} style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '.18em', textTransform: 'uppercase', color: RED, fontWeight: 700, marginBottom: 12 }}>작동 방식</div>
          <h2 className="lp-serif" style={{ fontSize: 'clamp(26px,3.6vw,40px)', fontWeight: 800, letterSpacing: '-.02em', margin: 0, wordBreak: 'keep-all' }}>
            복잡한 예방을, <span style={{ color: RED }}>매일 아침 카드 3장</span>으로.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
          {STEPS.map((s, i) => <StepCard key={s.no} step={s} i={i} />)}
        </div>
        <div style={{ textAlign: 'center', marginTop: 34 }}>
          <a className="lp-link" href="/service-guide.html" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', textDecoration: 'none', fontWeight: 600 }}>
            데이터·시나리오·조건식까지 — 자세히 보기 ↗
          </a>
        </div>
      </section>

      <footer style={{ position: 'relative', textAlign: 'center', padding: 'clamp(56px,10vh,96px) 20px 44px',
        color: 'rgba(255,255,255,.3)', fontSize: 12, letterSpacing: '.02em' }}>
        © ㈜아성다이소 안전보건팀 · SAGO AI
      </footer>
    </div>
  );
}
