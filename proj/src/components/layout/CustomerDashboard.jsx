import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import { DEEP_BLUE, CUSTOMER_BLUE, DAISO_RED, DAISO_GRAY, CANVAS } from '../../constants/colors.js';
import DAISO_LOGO from '../../data/logo.js';
import { Bell } from 'lucide-react';
import { pct, fmt, fmtKrw, TT } from '../../utils/uiHelpers.jsx';
import { CTABS } from '../../constants/tabs.js';
import ModeSidebar, { SidebarFlatNav } from './ModeSidebar.jsx';
import CUSTOMER_DATA from '../../data/customerData.js';
import { cFilter } from '../../utils/customerHelpers.js';
import COverview   from '../tabs/customer/COverview.jsx';
import CDept       from '../tabs/customer/CDept.jsx';
import CTypePlace  from '../tabs/customer/CTypePlace.jsx';
import CComp       from '../tabs/customer/CComp.jsx';
import CWatch      from '../tabs/customer/CWatch.jsx';
import CVictim     from '../tabs/customer/CVictim.jsx';

// ── ErrorBoundary — 탭 단위 오류 격리 ──────────────────────
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("[TabErrorBoundary]", e, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center py-16 px-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-md w-full text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <div className="text-sm font-semibold text-amber-800 mb-2">이 탭에서 오류가 발생했습니다</div>
            <div className="text-xs text-amber-700 bg-white rounded-lg p-2.5 border border-amber-100 font-mono text-left mb-3 break-all">
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer">
              다시 시도
            </button>
            <div className="text-[10px] text-amber-600 mt-2">다른 탭은 정상 작동합니다</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CustomerDashboard({ onBack, onAlertClick, onSwitchMode }) {
  const [ctab, setCtab] = useState("cov");
  const [yearFilter, setYearFilter] = useState("all");
  const D = useMemo(() => cFilter(CUSTOMER_DATA, yearFilter), [yearFilter]);
  const k = D.kpis;

  return (
    <div className="min-h-screen lg:flex" style={{background:"#FFFFFF"}}>
      {/* 좌측 사이드바 (데스크톱) — 모드 공용 */}
      <ModeSidebar dashMode="customer" onSwitchMode={onSwitchMode} title="고객 사고 현황" subtitle="㈜아성다이소 · 매장CS팀">
        <SidebarFlatNav items={CTABS} active={ctab} onSelect={setCtab} />
      </ModeSidebar>

      <div className="flex-1 min-w-0 lg:ml-[232px] flex flex-col min-h-screen">
        {/* ── sticky 헤더: 1행(56px) + 2행(40px) = 96px — 탭바 제거됨 ── */}
        <div className="sticky top-0 z-30 shadow-sm">

          {/* ── 1행: 모바일 헤더 (lg:hidden — 데스크톱은 사이드바) ── */}
          <div className="bg-white border-b border-stone-200 lg:hidden">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-center gap-2 sm:gap-4" style={{height:56}}>
              <img src={DAISO_LOGO} alt="DAISO" className="flex-shrink-0" style={{height:32,width:"auto",objectFit:"contain"}} />
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-stone-900 font-extrabold leading-none tracking-tight whitespace-nowrap text-base sm:text-xl">
                  고객 사고 현황
                </span>
                <span className="text-stone-400 text-[10px] sm:text-xs font-medium leading-none mt-0.5 whitespace-nowrap">
                  ㈜아성다이소 · 매장CS팀
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={onBack}
                  className="cursor-pointer whitespace-nowrap flex items-center"
                  style={{padding:"8px 10px",borderRadius:6,fontSize:11,fontWeight:700,
                    minHeight:40,background:"#F5F5F4",color:"#78716C",border:"none"}}>
                  근로자 사고
                </button>
                <button
                  className="cursor-default whitespace-nowrap flex items-center"
                  style={{padding:"8px 10px",borderRadius:6,fontSize:11,fontWeight:700,
                    minHeight:40,background:DEEP_BLUE,color:"white",border:"none"}}>
                  고객 사고
                </button>
                <button onClick={onAlertClick}
                  className="cursor-pointer whitespace-nowrap flex items-center gap-1"
                  style={{padding:"8px 10px",borderRadius:6,fontSize:11,fontWeight:700,
                    minHeight:40,background:"#F5F5F4",color:"#78716C",border:"none"}}>
                  <Bell size={11} />알림 관리
                </button>
              </div>
            </div>
          </div>

          {/* ── 2행: 기간 필터 + 통계 요약 ── */}
          <div className="bg-white border-b border-stone-100">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 h-10 flex items-center gap-2">
              <span className="text-xs text-stone-400 font-medium hidden sm:inline flex-shrink-0">기간:</span>
              <div className="flex items-center gap-0.5">
                {["all", "2024", "2025", "2026"].map(y => (
                  <button key={y} onClick={() => setYearFilter(y)}
                    className="cursor-pointer"
                    style={{padding:"3px 10px",borderRadius:5,fontSize:12,fontWeight:600,
                      background: yearFilter===y ? "#1C1917" : "transparent",
                      color: yearFilter===y ? "white" : "#78716C",
                      border:"none",transition:"all .15s"}}>
                    {y === "all" ? "전체" : y}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px bg-stone-200 mx-1 flex-shrink-0" />
              <span className="text-xs text-stone-500 flex-shrink-0">
                {yearFilter === "all" ? "전체" : `${yearFilter}년`}&nbsp;
                <b className="text-stone-900 tabular-nums">{k.total.toLocaleString()}건</b>
              </span>
              <span className="text-xs text-stone-500 hidden sm:inline flex-shrink-0">
                · 보상 <b className="text-stone-900 tabular-nums">{(k.total_comp/100000000).toFixed(1)}억원</b>
              </span>
              <span className="text-xs text-stone-500 hidden sm:inline flex-shrink-0">
                · 처리중 <b className="text-stone-900 tabular-nums">{k.still_open}건</b>
              </span>
            </div>
          </div>
        </div>

        {/* ── 콘텐츠: 탭 전환마다 dash-slide-up ── */}
        <main className="flex-1 px-4 md:px-6 py-4 pb-16 lg:pb-4">
          <div className="max-w-screen-xl mx-auto">
            <TabErrorBoundary key={ctab}>
              <div className="dash-slide-up">
                {ctab === "cov"   && <COverview D={D}/>}
                {ctab === "cdept" && <CDept D={D}/>}
                {ctab === "ctype" && <CTypePlace D={D}/>}
                {ctab === "ccomp" && <CComp D={D}/>}
                {ctab === "cwatch"&& <CWatch D={D}/>}
                {ctab === "cvic"  && <CVictim D={D}/>}
              </div>
            </TabErrorBoundary>
          </div>
        </main>

        <footer className="border-t border-stone-200 px-6 py-3 text-xs text-stone-400 flex justify-between mb-14 lg:mb-0">
          <span>© ㈜아성다이소 매장CS팀 · {new Date().getFullYear()}.{String(new Date().getMonth()+1).padStart(2,"0")}.{String(new Date().getDate()).padStart(2,"0")}</span>
          <span>고객사고 6개 탭 · 1,512건 · 2024~2026</span>
        </footer>
      </div>

      {/* ── 모바일 고정 하단 탭바 (iOS 패턴) — lg:hidden ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 lg:hidden">
        <div className="flex">
          {CTABS.map(t => (
            <button
              key={t.id}
              onClick={() => setCtab(t.id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-1.5 gap-0.5 transition-colors cursor-pointer active:scale-[0.97] ${
                ctab === t.id
                  ? "text-[#13245A]"
                  : "text-stone-400"
              }`}>
              <t.Icon
                size={ctab === t.id ? 20 : 18}
                strokeWidth={ctab === t.id ? 2.5 : 1.8}
                className="transition-all duration-150"
              />
              <span className="text-[9px] font-semibold leading-none tracking-tight">
                {t.short}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}


// ============================================================
// APP (근로자 + 고객 통합 라우터)
// ============================================================

// URL 상태 복원 — App 함수 외부에서 한 번만 실행
export default CustomerDashboard;
