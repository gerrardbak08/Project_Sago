import { useState, useEffect, useMemo, useRef, Fragment, Component } from 'react';
import { createRoot } from 'react-dom/client';

// ── 데이터 ─────────────────────────────────────────────
import DEFAULT_DATA from './data/workerData.js';
import MAP_STORES   from './data/storesData.js';
import DAISO_LOGO   from './data/logo.js';
import { STORE_SNAPSHOTS } from './data/snapshots.js';

// ── 색상 + 상수 ────────────────────────────────────────
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, DAISO_GRAY,
         BL, OR, NV, GR, RD, GN, CANVAS } from './constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from './constants/metrics.js';
import { TABS_VIEWER, HUB_LABELS, ALERT_TABS } from './constants/tabs.js';

// ── 유틸 ──────────────────────────────────────────────
import { pct, fmt, fmtKrw, TT, EmptyState } from './utils/uiHelpers.jsx';
import { injectDashCss } from './utils/motion.js';
import { track, TAB_VIEWED } from './utils/analytics.js';
import { ExportBtn }          from './utils/exportUtils.jsx';
import { getFilteredData }    from './utils/filterData.js';
import { parseExcelFile, parseExcelFileWorkers } from './utils/parseExcel.js';
import { processAccidents }   from './utils/processAccidents.js';
import { processStores }      from './utils/processStores.js';
import { processWorkers }     from './utils/processData.js';

// ── 아이콘 ─────────────────────────────────────────────
import { LayoutDashboard, Building, Building2, MapPin,
         TrendingUp, GitBranch, UserCircle, Users, Scale, Banknote,
         Stethoscope, Bell, ChevronRight, ShieldCheck, Store,
         X, AlertCircle, Send, Lock } from 'lucide-react';
import AlertMonitoring from './components/tabs/alert/AlertMonitoring.jsx';
import AlertSend       from './components/tabs/alert/AlertSend.jsx';
import AlertReview     from './components/tabs/alert/AlertReview.jsx';

// ── 공유 컴포넌트 ──────────────────────────────────────
import { Card }              from './components/shared/Card.jsx';
import AdminUpload           from './components/admin/AdminUpload.jsx';
import CustomerDashboard     from './components/layout/CustomerDashboard.jsx';
import LandingPage           from './components/layout/LandingPage.jsx';

// ── 근로자 탭 컴포넌트 ─────────────────────────────────
import Overview          from './components/tabs/worker/Overview.jsx';
import DeptTeamStore     from './components/tabs/worker/DeptTeamStore.jsx';
import StoreRiskMap      from './components/tabs/worker/StoreRiskMap.jsx';
import TimeSeries        from './components/tabs/worker/TimeSeries.jsx';
import CrossAnalysis     from './components/tabs/worker/CrossAnalysis.jsx';
import HumanFactors      from './components/tabs/worker/HumanFactors.jsx';
import CostRisk          from './components/tabs/worker/CostRisk.jsx';
import LegalReporting    from './components/tabs/worker/LegalReporting.jsx';
import StoreAnalysis     from './components/tabs/worker/StoreAnalysis.jsx';
import RepeatWorkers     from './components/tabs/worker/RepeatWorkers.jsx';
import SeverityAnalysis  from './components/tabs/worker/SeverityAnalysis.jsx';
import ParjangDashboard  from './components/tabs/worker/ParjangDashboard.jsx';
import StoreDeepDive     from './components/tabs/worker/StoreDeepDive.jsx';

// ── TabErrorBoundary ───────────────────────────────────
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
            <button onClick={() => this.setState({ error: null })}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer">
              다시 시도
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const _INIT_HASH_PARAMS = (() => {
  try {
    if (typeof window === "undefined") return {};
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return {};
    const params = Object.fromEntries(new URLSearchParams(h).entries());
    if (params.store && /%[0-9A-Fa-f]{2}/.test(params.store)) {
      try { params.store = decodeURIComponent(params.store); } catch {}
    }
    return params;
  } catch { return {}; }
})();

function App() {
  injectDashCss();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // === 랜딩 페이지 — ?skip=1 또는 ?role=xxx 이면 바이패스 ===
  const _skipLanding = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("skip") === "1" || !!p.get("role");
    } catch { return false; }
  })();
  const [showLanding, setShowLanding] = useState(!_skipLanding);
  const [landingFading, setLandingFading] = useState(false);

  const [dashMode, setDashMode] = useState("worker"); // "worker" | "customer" | "alert"
  // === 역할 기반 랜딩 ===
  const initialRole = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role")) || null;
  const ROLE_LANDING = { ceo: "overview", manager: "dept", team: "parjang", part: "store", safety: "overview" };
  const ROLE_LABELS = { ceo: "경영진", manager: "영업부문장", team: "팀장", part: "파트장", safety: "안전보건팀" };

  const [tab, setTabState] = useState(
    _INIT_HASH_PARAMS.tab || (initialRole && ROLE_LANDING[initialRole] ? ROLE_LANDING[initialRole] : "overview")
  );
  const [alertTab, setAlertTab] = useState("alert_monitor"); // 알림 모드 내 탭
  const [lastSentDate, setLastSentDate] = useState(null);
  const [preFillStore, setPreFillStore] = useState(null);
  const [currentRole, setCurrentRole] = useState(_INIT_HASH_PARAMS.role || initialRole || null);
  const [yearFilter, setYearState] = useState(_INIT_HASH_PARAMS.year || "all");

  // 랜딩 → 대시보드 페이드 전환
  const handleLandingEnter = () => {
    setLandingFading(true);
    setTimeout(() => setShowLanding(false), 400);
  };
  const handleLandingRoleSelect = (roleId) => {
    setCurrentRole(roleId);
    const ROLE_LANDING = { ceo: "overview", manager: "dept", team: "parjang", part: "store", safety: "overview" };
    if (ROLE_LANDING[roleId]) setTabState(ROLE_LANDING[roleId]);
  };

  // URL hash 동기화 — history.replaceState (리로드 없음)
  const setTab = (t) => {
    setTabState(t);
    track(TAB_VIEWED, { tab_id: t, dashboard_mode: dashMode, role_filter: currentRole ?? null, year_filter: yearFilter ?? 'all' });
    try {
      const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      p.set("tab", t);
      history.replaceState(null, "", "#" + p.toString());
    } catch {}
  };
  const switchMode = (mode) => {
    setDashMode(mode);
    track(TAB_VIEWED, { tab_id: 'mode_' + mode, dashboard_mode: mode, role_filter: currentRole ?? null, year_filter: yearFilter ?? 'all' });
  };
  const setYearFilter = (y) => {
    setYearState(y);
    try {
      const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (!y || y === "all") p.delete("year"); else p.set("year", y);
      const s = p.toString();
      history.replaceState(null, "", s ? "#" + s : window.location.pathname + window.location.search);
    } catch {}
  };
  // F4: 매장 URL 동기화
  const syncStoreToUrl = (storeName) => {
    try {
      const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (!storeName) p.delete("store"); else p.set("store", storeName);
      const s = p.toString();
      history.replaceState(null, "", s ? "#" + s : window.location.pathname + window.location.search);
    } catch {}
  };
  const [data, setData] = useState(DEFAULT_DATA);
  const [rawAccidents, setRawAccidents] = useState(null);
  const [rawStores, setRawStores] = useState(null);
  const [rawWorkers, setRawWorkers] = useState(null);
  const [accidentFileName, setAccidentFileName] = useState(null);
  const [storeFileName, setStoreFileName] = useState(null);
  const [workerFileName, setWorkerFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const isDefault = !accidentFileName && !storeFileName && !workerFileName;
  
  
  const processUploaded = async (accRows, storeRows, workerRows, workerRefDate = null) => {
    try {
      setLoading(true); setError(null);
      let newData;
      const storesProcessed = storeRows ? processStores(storeRows) : null;
      const workersProcessed = workerRows ? processWorkers(workerRows, workerRefDate) : null;
      if (accRows) {
        newData = processAccidents(accRows, storesProcessed, workersProcessed);
      } else if (rawAccidents) {
        newData = processAccidents(rawAccidents, storesProcessed, workersProcessed);
      } else if (storeRows) {
        newData = { ...data, store_kpi: { total: storesProcessed.length } };
        if (workersProcessed) newData.worker_kpis = workersProcessed.kpis;
      } else if (workersProcessed) {
        newData = { ...data, worker_kpis: workersProcessed.kpis };
      }
      if (newData) setData(newData);
    } catch (e) {
      console.error("[processUploaded]", e);
      setError("데이터 처리 실패: " + e.message);
    } finally { setLoading(false); }
  };

  const handleAccidentFile = async (file) => {
    try {
      setLoading(true); setError(null);
      const rows = await parseExcelFile(file);
      setRawAccidents(rows); setAccidentFileName(file.name);
      await processUploaded(rows, rawStores, rawWorkers);
    } catch (e) { setError("사고 DB 파싱 실패: " + e.message); setLoading(false); }
  };
  
  const handleStoreFile = async (file) => {
    try {
      setLoading(true); setError(null);
      const rows = await parseExcelFile(file);
      setRawStores(rows); setStoreFileName(file.name);
      await processUploaded(rawAccidents, rows, rawWorkers);
    } catch (e) { setError("매장 DB 파싱 실패: " + e.message); setLoading(false); }
  };

  const handleWorkerFile = async (file) => {
    try {
      setLoading(true); setError(null);
      const parsed = await parseExcelFileWorkers(file);
      if (!parsed.rows || parsed.rows.length === 0) {
        throw new Error("'영업부' 시트가 비어 있거나 읽을 수 없습니다");
      }
      // 파일명에서 날짜 자동 추출 (예: 현장사원_인원현황_20260428.xlsx)
      let refDate = null;
      const dm = file.name.match(/(\d{8})/);
      if (dm) {
        const d = dm[1];
        const candidate = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
        if (!isNaN(candidate.getTime())) refDate = candidate;
      }
      setRawWorkers(parsed.rows); setWorkerFileName(file.name);
      await processUploaded(rawAccidents, rawStores, parsed.rows, refDate);
    } catch (e) {
      console.error("[handleWorkerFile]", e);
      setError("매장근로자 DB 파싱 실패: " + e.message);
      setLoading(false);
    }
  };
  
  const resetData = () => {
    setData(DEFAULT_DATA);
    setRawAccidents(null); setRawStores(null); setRawWorkers(null);
    setAccidentFileName(null); setStoreFileName(null); setWorkerFileName(null);
    setError(null);
  };
  
  const handleLogout = () => {
    if (tab === "alert_monitor" || tab === "alert_send") setTab("overview");
  };
  
  // === 역할별 탭 필터링 (RBAC Phase 2) ===
  const ROLE_TAB_VISIBILITY = {
    // 경영진: 요약·트렌드·재무·심각도 집중
    ceo:     ["overview", "time", "legal", "severity", "cost", "sigungu"],
    // 영업부문장: 부서/팀/매장 + 요인분석 + 위험지도 (운영·안전팀 전용 탭 제외)
    manager: ["overview", "cross", "dept", "store", "parjang", "riskmap", "c_typeplace", "c_dept", "c_watch"],
    // 팀장: 매장IR + 파트장 + 인적요인 + 재발 + 위험지도 + 시계열 + 부서
    team:    ["overview", "dept", "store", "riskmap", "parjang", "repeat", "human", "severity", "time"],
    // 파트장: 자기 담당 매장 + 위험지도 + 파트장 대시보드
    part:    ["overview", "store", "riskmap", "repeat", "parjang"],
    // 안전보건팀: 전체 접근
    safety:  null,
  };
  
  // 연도 필터 적용된 데이터 (모든 탭 일괄 처리)
  const dataFiltered = useMemo(() => getFilteredData(data, yearFilter), [data, yearFilter]);
  
  const visibleTabs = currentRole && ROLE_TAB_VISIBILITY[currentRole]
    ? TABS_VIEWER.filter(t => ROLE_TAB_VISIBILITY[currentRole].includes(t.id))
    : TABS_VIEWER;
  
  // Visible tabs
  const TABS = visibleTabs;

  // 랜딩 페이지
  if (showLanding) return (
    <div style={{
      opacity: landingFading ? 0 : 1,
      transition: 'opacity .4s ease',
      pointerEvents: landingFading ? 'none' : 'auto',
    }}>
      <LandingPage onEnter={handleLandingEnter} />
    </div>
  );

  // 알림 모드 — customer 대시보드와 동일하게 별도 렌더
  if (dashMode === "alert") return (
    <div className="min-h-screen" style={{background:"linear-gradient(135deg, #F5F5F4 0%, #FAFAF9 40%, #F0F4FF 100%)"}}>
      {/* 헤더 */}
      <div className="sticky top-0 z-40 shadow-sm">
        <div className="bg-white border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-center gap-2 sm:gap-4" style={{height:56}}>
            <img src={DAISO_LOGO} alt="DAISO" className="flex-shrink-0" style={{height:32,width:"auto",objectFit:"contain"}} />
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-stone-900 font-extrabold leading-none tracking-tight whitespace-nowrap text-base sm:text-xl">
                안전 알림 관리
              </span>
              <span className="text-stone-400 text-[10px] sm:text-xs font-medium leading-none mt-0.5 whitespace-nowrap">
                ㈜아성다이소 · 안전보건팀
              </span>
            </div>
            <div className="flex-1" />
            {/* 모드 토글 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => switchMode("worker")}
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#F5F5F4",color:"#78716C",border:"none"}}
                className="cursor-pointer whitespace-nowrap">근로자 사고</button>
              <button onClick={() => switchMode("customer")}
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#F5F5F4",color:"#78716C",border:"none"}}
                className="cursor-pointer whitespace-nowrap">고객 사고</button>
              <button onClick={() => switchMode("alert")}
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#4F46E5",color:"white",border:"none"}}
                className="cursor-pointer whitespace-nowrap">알림 관리</button>
            </div>
          </div>
        </div>
        {/* 알림 탭바 */}
        <div className="bg-white border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-2 sm:px-4 flex gap-0">
            {ALERT_TABS.map(t => (
              <button key={t.id} onClick={() => setAlertTab(t.id)}
                className={`min-h-[42px] sm:min-h-[46px] px-3 sm:px-4 py-2.5 text-xs sm:text-[13px] font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border-b-2 ${alertTab === t.id ? "border-indigo-600 text-indigo-700 font-bold" : "border-transparent text-stone-400 hover:text-stone-700 hover:border-stone-300"}`}
                style={{ minWidth: 48, flexShrink: 0 }}>
                <t.Icon size={13} strokeWidth={2} className="flex-shrink-0" />
                <span className="hidden sm:inline">{t.l}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-3 sm:py-5">
        <TabErrorBoundary key={alertTab}>
          {alertTab === "alert_monitor"  && <AlertMonitoring initialDate={lastSentDate} onSendRequest={(storeCode) => { if (storeCode) setPreFillStore(storeCode); setAlertTab("alert_send"); }} />}
          {alertTab === "alert_send"     && <AlertSend onSent={(sentDate) => { setLastSentDate(sentDate); setAlertTab("alert_monitor"); }} preFillStore={preFillStore} onPreFillConsumed={() => setPreFillStore(null)} />}
          {alertTab === "alert_review"   && <AlertReview onSendRequest={(storeCode) => { if (storeCode) setPreFillStore(storeCode); setAlertTab("alert_send"); }} />}
        </TabErrorBoundary>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 py-4 text-xs text-stone-400 border-t border-stone-100 mt-6">
        <div>© ㈜아성다이소 안전보건팀 · {new Date().getFullYear()}.{String(new Date().getMonth()+1).padStart(2,"0")}</div>
      </div>
    </div>
  );

  if (dashMode === "customer") return (
    <CustomerDashboard
      onBack={() => setDashMode("worker")}
      onAlertClick={() => setDashMode("alert")}
    />
  );

  return (
    <div className="min-h-screen pb-14 lg:pb-0" style={{background:"linear-gradient(135deg, #F5F5F4 0%, #FAFAF9 40%, #F0F4FF 100%)"}}>
      {/* ═══ 헤더 (모바일 최적화) ═══ */}
      <div className="sticky top-0 z-40 shadow-sm" style={{animation:"dashSlideDown .4s ease both"}}>

        {/* ── 1행: 흰 배경 + CI + 회사명 + 모드 토글 ── */}
        <div className="bg-white border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-center gap-2 sm:gap-4" style={{height:56}}>
            {/* 다이소 CI 로고 */}
            <img src={DAISO_LOGO} alt="DAISO" className="flex-shrink-0" style={{height:32,width:"auto",objectFit:"contain"}} />
            {/* 제목 + 회사명 */}
            <div className="flex flex-col justify-center min-w-0 overflow-hidden">
              <span className="text-stone-900 font-extrabold leading-none tracking-tight truncate text-base sm:text-xl">
                근로자 사고 현황
              </span>
              <span className="text-stone-400 text-[10px] sm:text-xs font-medium leading-none mt-0.5 truncate">
                ㈜아성다이소 · 안전보건팀
              </span>
            </div>
            <div className="flex-1" />
            {/* 모드 토글 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => switchMode("worker")} className="cursor-pointer whitespace-nowrap"
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                  background: DAISO_RED, color:"white", border:"none",
                  transition:"all .2s", transform:"scale(1.05)"}}>
                근로자 사고
              </button>
              <button onClick={() => switchMode("customer")} className="cursor-pointer whitespace-nowrap"
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                  background:"#F5F5F4", color:"#78716C", border:"none",
                  transition:"all .2s"}}>
                고객 사고
              </button>
              <button onClick={() => switchMode("alert")} className="cursor-pointer whitespace-nowrap flex items-center gap-1"
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                  background:"#F5F5F4", color:"#78716C", border:"none",
                  transition:"all .2s"}}>
                <Bell size={11} />알림 관리
              </button>
            </div>
          </div>
        </div>

        {/* ── 2행: 기간 필터 + 건수 + 역할 ── */}
        <div className="bg-white border-b border-stone-100">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-5 h-10 flex items-center gap-2">
            <span className="text-xs text-stone-400 font-medium hidden sm:inline flex-shrink-0">기간:</span>
            <div className="flex items-center gap-0.5">
              {["all", "2024", "2025", "2026"].map(y => (
                <button key={y} onClick={() => setYearFilter(y)}
                  className="cursor-pointer"
                  style={{padding:"3px 10px",borderRadius:999,fontSize:12,fontWeight:600,
                    background: yearFilter===y ? "#1C1917" : "transparent",
                    color: yearFilter===y ? "white" : "#78716C",
                    border:"none",transition:"all .15s",
                    transform: yearFilter===y ? "scale(1.05)" : "scale(1)"}}>
                  {y === "all" ? "전체" : y}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-stone-200 mx-1 flex-shrink-0" />
            <span className="text-xs text-stone-500 flex-shrink-0">
              {yearFilter === "all" ? "전체" : `${yearFilter}년`}&nbsp;
              <b className="text-stone-900 tabular-nums">{fmt(yearFilter === "all" ? data.kpis.total : yearFilter === "2024" ? data.kpis.y2024 : yearFilter === "2025" ? data.kpis.y2025 : yearFilter === "2026" ? data.kpis.y2026 : data.kpis.total)}건</b>
            </span>
            {data.store_kpi && (() => {
              // yearFilter에 따라 해당 연도 5월 스냅샷의 매장수 표시 (없으면 현재 store_kpi.total fallback)
              let storeCount = data.store_kpi.total;
              let label = "영업매장";
              if (yearFilter !== "all") {
                const snap = STORE_SNAPSHOTS.find(s => s.ym === `${yearFilter}-05`);
                if (snap) { storeCount = snap.count; label = `${yearFilter}-05 영업매장`; }
              }
              return (
                <span className="text-xs text-stone-500 hidden sm:inline flex-shrink-0">
                  · {label} <b className="text-stone-900 tabular-nums">{fmt(storeCount)}개</b>
                </span>
              );
            })()}
            <div className="flex-1" />
            <select value={currentRole || ""} onChange={(e) => {
              const r = e.target.value || null;
              setCurrentRole(r);
              if (r && ROLE_LANDING[r]) setTab(ROLE_LANDING[r]);
              else if (!r) setTab("overview");
            }} className="h-7 px-2 rounded-md border border-stone-200 text-xs font-medium text-stone-700 bg-white cursor-pointer" style={{ fontFamily: "inherit" }}>
              <option value="">역할 선택</option>
              <option value="ceo">경영진</option>
              <option value="manager">영업부문장</option>
              <option value="team">팀장</option>
              <option value="part">파트장</option>
              <option value="safety">안전보건팀</option>
            </select>
            <button onClick={() => window.print()} className="hidden md:flex h-7 px-2.5 rounded-md border border-stone-200 text-xs font-medium text-stone-500 bg-white hover:bg-stone-50 cursor-pointer items-center gap-1">
              🖨 인쇄
            </button>
          </div>
        </div>

        {/* ── 3행: 탭바 ── */}
        <div className="bg-white border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-2 sm:px-4 flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`min-h-[42px] sm:min-h-[46px] px-3 sm:px-4 py-2.5 text-xs sm:text-[13px] font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border-b-2 ${tab === t.id ? "border-stone-900 text-stone-900 font-bold" : "border-transparent text-stone-400 hover:text-stone-700 hover:border-stone-300"}`}
                style={{ minWidth: 48, flexShrink: 0 }}>
                <t.Icon size={13} strokeWidth={2} className="flex-shrink-0" />
                <span className="hidden sm:inline">{t.l}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* 역할 안내 배너 */}
      {currentRole && (
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 pt-2 sm:pt-3 dash-slide-up">
          <div className="rounded-lg bg-white border border-stone-200 p-3 flex items-start gap-3" style={{ borderLeft: `3px solid ${currentRole === "ceo" ? "#1C1917" : currentRole === "manager" ? "#4F46E5" : currentRole === "team" ? "#0891B2" : currentRole === "part" ? "#B45309" : DAISO_RED}` }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: currentRole === "ceo" ? "#1C1917" : currentRole === "manager" ? "#4F46E5" : currentRole === "team" ? "#0891B2" : currentRole === "part" ? "#B45309" : DAISO_RED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {currentRole === "ceo" && <Building2 size={14} color="white" />}
              {currentRole === "manager" && <Users size={14} color="white" />}
              {currentRole === "team" && <ShieldCheck size={14} color="white" />}
              {currentRole === "part" && <Store size={14} color="white" />}
              {currentRole === "safety" && <Lock size={14} color="white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-stone-900 flex items-center gap-2">
                {ROLE_LABELS[currentRole]} 뷰
                <span className="text-[10px] font-normal text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                  {ROLE_TAB_VISIBILITY[currentRole] ? `${ROLE_TAB_VISIBILITY[currentRole].length}개 탭` : "전체 탭"}
                </span>
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                {currentRole === "ceo" && "월간 보고 · 비용 손실 · 전사 KPI · 중상해사고 조기경보 · 지역 분포"}
                {currentRole === "manager" && "영업부문별 비교 · 팀 순위 · 위험지도 · 인적요인 · 지역 분석"}
                {currentRole === "team" && "매장 IR · 파트장 평가 · 재발재해자 · 위험지도 · 인적요인"}
                {currentRole === "part" && "관할 매장 모니터링 · 위험지도 · 재발재해자"}
                {currentRole === "safety" && "전사 데이터 관리 · 법규 감사 · 중처법 대응 · 전체 탭 접근"}
              </div>
            </div>
            <button onClick={() => { setCurrentRole(null); }} className="text-xs text-stone-400 hover:text-stone-600 flex-shrink-0 cursor-pointer"><X size={16} /></button>
          </div>
        </div>
      )}
      
      {error && <div className="max-w-[1400px] mx-auto px-4 pt-4"><div className="p-3 rounded-lg bg-[#FEF2F3] border border-[#FCE0E3] text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</div></div>}
      
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-3 sm:py-5">
        <div key={tab} className="dash-slide-up">
          <TabErrorBoundary key={tab}>
            {tab === "overview" && <Overview D={dataFiltered} yearFilter={yearFilter} role={currentRole} setTab={setTab} onStoreSelect={(storeCode) => { if (storeCode) setPreFillStore(storeCode); setTab("riskmap"); }} />}
            {tab === "dept" && <DeptTeamStore D={data} yearFilter={yearFilter} />}
            {tab === "store" && <StoreAnalysis D={dataFiltered} yearFilter={yearFilter} setYearFilter={setYearFilter} />}
            {tab === "riskmap" && <StoreRiskMap D={data} yearFilter={yearFilter} setYearFilter={setYearFilter} syncStoreToUrl={syncStoreToUrl} initStore={preFillStore ?? _INIT_HASH_PARAMS.store} onPreFillConsumed={() => setPreFillStore(null)} />}
            {tab === "sigungu" && <StoreDeepDive D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "time" && <TimeSeries D={data} yearFilter={yearFilter} />}
            {tab === "cross" && <CrossAnalysis D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "human" && <HumanFactors D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "repeat" && <RepeatWorkers D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "severity" && <SeverityAnalysis D={data} yearFilter={yearFilter} />}
            {tab === "parjang" && <ParjangDashboard D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "cost" && <CostRisk D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "legal" && <LegalReporting D={dataFiltered} yearFilter={yearFilter} />}
          </TabErrorBoundary>
        </div>
      </div>
      
      <div className="max-w-[1400px] mx-auto px-4 py-4 text-xs text-stone-400 border-t border-stone-100 mt-6 flex justify-between flex-wrap gap-2">
        <div>© ㈜아성다이소 안전보건팀 · v9 · {new Date().getFullYear()}.{String(new Date().getMonth()+1).padStart(2,"0")}</div>
      </div>

      {/* ── 모바일 하단 탭 내비 (640px 미만 = 스마트폰만) ── */}
      {isMobile && <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[60px] flex flex-col items-center gap-0.5 pt-1.5 pb-1 border-t-2 transition cursor-pointer ${tab === t.id ? "border-[#D70011] text-stone-900" : "border-transparent text-stone-400"}`}>
              <t.Icon size={18} strokeWidth={2} className="flex-shrink-0" />
              <span className="text-[9px] font-semibold leading-tight whitespace-nowrap">{t.short}</span>
            </button>
          ))}
        </div>
      </nav>}
    </div>
  );
}
export default App;
