import { useState, useEffect, useMemo, useRef, Fragment, Component } from 'react';
import { createRoot } from 'react-dom/client';

// ── 데이터 ─────────────────────────────────────────────
import DEFAULT_DATA from './data/workerData.js';
import MAP_STORES   from './data/storesData.js';
import DAISO_LOGO   from './data/logo.js';
import { STORE_SNAPSHOTS } from './data/snapshots.js';
import RAW_STORES   from './data/raw/stores.json';
import { fetchLiveSnapshot, buildWorkerDataFromLive } from './utils/liveSource.js';
import LIVE_SNAPSHOT from './data/liveSnapshot.js';

// ── 색상 + 상수 ────────────────────────────────────────
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, DAISO_GRAY,
         BL, OR, NV, GR, RD, GN, CANVAS } from './constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from './constants/metrics.js';
import { TABS_VIEWER, HUB_LABELS, ALERT_TABS, TAB_GROUPS } from './constants/tabs.js';

// ── 유틸 ──────────────────────────────────────────────
import { pct, fmt, fmtKrw, TT, EmptyState } from './utils/uiHelpers.jsx';
import { injectDashCss } from './utils/motion.js';
import { track, TAB_VIEWED } from './utils/analytics.js';
import { ExportBtn, XlsxBtn } from './utils/exportUtils.jsx';
import { ReportModal } from './components/shared/ReportModal.jsx';
import { DataSearchModal } from './components/shared/DataSearchModal.jsx';
import { getFilteredData }    from './utils/filterData.js';
import { parseExcelFile, parseExcelFileWorkers } from './utils/parseExcel.js';
import { processAccidents }   from './utils/processAccidents.js';
import { processStores }      from './utils/processStores.js';
import { processWorkers }     from './utils/processData.js';

// ── 아이콘 ─────────────────────────────────────────────
import { LayoutDashboard, Building, Building2, MapPin, FileText, Search,
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
import ModeSidebar, { SidebarFlatNav } from './components/layout/ModeSidebar.jsx';
import { SegmentedToggle } from './components/shared/MotionBits.jsx';
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
import RepeatStores      from './components/tabs/worker/RepeatStores.jsx';
import SeverityAnalysis  from './components/tabs/worker/SeverityAnalysis.jsx';
import SevereStores      from './components/tabs/worker/SevereStores.jsx';
import ParjangDashboard  from './components/tabs/worker/ParjangDashboard.jsx';
import RawDbViewer       from './components/tabs/worker/RawDbViewer.jsx';

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

// 라이브 시트(Apps Script)가 채우지 못하는 항목이 있는 탭 — '비자동(수동/추정)' 표기 대상
const NONAUTO_TABS = new Set(['human', 'riskmap', 'severity', 'parjang']);
const NONAUTO_NOTE = '인적속성(연령·성별·고용)·매장좌표·실비용(KRW)·상병명은 라이브 시트에 없어 수동 업로드/추정값입니다. 시트 갱신으로 자동 반영되지 않습니다.';

// ── 데이터 머지 헬퍼 ──────────────────────────────────────
// 라이브(buildWorkerDataFromLive)가 채운 섹션은 라이브(최신 rows 기준),
// workers=null 이라 비어 있는 근로자 파생 섹션(IR·인적·성별·연령·상병·비용 등)은
// base(정적 May) 로 폴백한다.
const _isEmpty = (v) =>
  v == null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

// 근로자/IR·rate 파생 섹션 — 라이브는 건수만 채우고 ir_per100/rate는 null이라
// 비어있지않은 배열로 base(IR값 보유)를 덮어쓰는 문제 방지 → 항상 정적 May 유지
const STATIC_KEEP = new Set([
  'worker_ir_summary', 'worker_kpis', 'team_ir', 'dept_ir',
  'form_stats', 'size_stats', 'age_stats', 'sido_stats', 'sigungu_top',
  'guibun', 'warehouse',
]);

function mergeLiveOntoStatic(live, base) {
  if (!live) return base;
  const out = { ...base };
  for (const k of Object.keys(live)) {
    if (STATIC_KEEP.has(k)) continue; // 근로자/IR 파생 → 정적 유지(라이브가 IR을 못 채움)
    const lv = live[k];
    if (_isEmpty(lv)) continue; // 라이브가 비운 섹션 → base 유지(근로자 파생)
    if (k === 'kpis' && lv && base && base.kpis) {
      // 건수계 kpi(total/yearly/monthly 등)는 라이브, 근로자계(cost/loss_days 등
      // 라이브가 null)는 base 유지
      const mk = { ...base.kpis };
      for (const kk of Object.keys(lv)) {
        const v = lv[kk];
        if (v != null && !(typeof v === 'number' && Number.isNaN(v))) mk[kk] = v;
      }
      out.kpis = mk;
    } else {
      out[k] = lv;
    }
  }
  return out;
}

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

  // 첫 화면은 어떤 경우에도(해시·역할 무관) 요약 탭 고정
  const [tab, setTabState] = useState("overview");
  const [alertTab, setAlertTab] = useState("alert_monitor"); // 알림 모드 내 탭
  const [lastSentDate, setLastSentDate] = useState(null);
  const [preFillStore, setPreFillStore] = useState(null);
  const [currentRole, setCurrentRole] = useState(_INIT_HASH_PARAMS.role || initialRole || null);
  const [yearFilter, setYearState] = useState(String(CURRENT_YEAR)); // 첫 화면 항상 2026 고정 (해시 무관)

  // 랜딩 → 대시보드 페이드 전환
  const handleLandingEnter = () => {
    setLandingFading(true);
    setTimeout(() => setShowLanding(false), 400);
  };
  const handleLandingRoleSelect = (roleId) => {
    setCurrentRole(roleId); // 역할은 데이터 필터용 — 첫 탭은 항상 요약 고정(역할 랜딩 비활성)
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
  const [dataSource, setDataSource] = useState('static'); // 'static' | 'live' | 'fallback'
  const [basis, setBasis] = useState('incident');         // 'incident'(사고경위) | 'approval'(산재승인)
  const [showReport, setShowReport] = useState(false);    // 요약 보고서 모달
  const [showSearch, setShowSearch] = useState(false);    // 데이터 조회 모달
  const liveFetchedRef = useRef(false);                   // StrictMode 이중호출 방지
  const basisRef = useRef('incident');                    // 라이브 fetch 콜백에서 최신 basis 읽기용
  const liveRef = useRef({                               // { rows, approvalIds } — 기준 전환 재빌드용 원본
    rows: LIVE_SNAPSHOT.rows,
    approvalIds: new Set((LIVE_SNAPSHOT.approvalRows || []).map(r => r.recordId)),
  });

  // 라이브 연동: 마운트 시 시트(Apps Script v4.0)에서 raw rows 를 받아 liveRef 를 갱신한다.
  // 초기엔 baked 스냅샷(LIVE_SNAPSHOT)이 liveRef 에 이미 들어 있어 토글이 즉시 작동한다.
  // 라이브 fetch 성공 시 liveRef 를 최신으로 덮어쓰고, approval 기준이면 재빌드.
  // incident 기준이면 rich 정적 DEFAULT_DATA 를 그대로 유지 (setData 호출 안 함).
  useEffect(() => {
    if (liveFetchedRef.current) return; // StrictMode 이중호출 방지
    liveFetchedRef.current = true;
    let alive = true;
    fetchLiveSnapshot({ division: '안전보건팀', year: '전체', month: '전체' })
      .then((snap) => {
        if (!alive) return;
        liveRef.current = { rows: snap.rows, approvalIds: new Set((snap.approvalRows || []).map((r) => r.recordId)) };
        setDataSource('live');
        if (basisRef.current === 'approval') {
          const built = buildWorkerDataFromLive(snap.rows, RAW_STORES.data, { basis: 'approval', approvalIds: liveRef.current.approvalIds });
          if (built && built.kpis) setData(built);
        } else {
          // basis === 'incident': 최신 라이브 rows 로 머지 갱신 (건수계 최신화)
          const liveInc = buildWorkerDataFromLive(snap.rows, RAW_STORES.data, { basis: 'incident' });
          setData(mergeLiveOntoStatic(liveInc, DEFAULT_DATA));
        }
      })
      .catch((e) => { console.warn('[live] 로드 실패, 스냅샷 데이터 유지:', e?.message); });
    return () => { alive = false; };
  }, []);

  // 기준(사고경위/산재승인) 전환: 하이브리드
  //   incident → rich 정적 DEFAULT_DATA (모든 섹션 보존, 현재 기본 화면 불변)
  //   approval → baked 스냅샷(또는 라이브 갱신 후 최신 liveRef)에서 재집계
  useEffect(() => {
    basisRef.current = basis;
    if (accidentFileName || storeFileName || workerFileName) return; // 업로드 보호
    if (basis === 'incident') {
      // 사고경위: baked 스냅샷(liveRef 이미 LIVE_SNAPSHOT 으로 시드)으로 머지
      // 근로자 파생 섹션(IR·인적·성별·연령·상병·비용)은 base(정적 May) 폴백 유지
      const liveInc = buildWorkerDataFromLive(
        liveRef.current.rows,
        RAW_STORES.data,
        { basis: 'incident' }
      );
      setData(mergeLiveOntoStatic(liveInc, DEFAULT_DATA));
      return;
    }
    // basis === 'approval'
    const live = liveRef.current;
    const built = buildWorkerDataFromLive(live.rows, RAW_STORES.data, { basis: 'approval', approvalIds: live.approvalIds });
    if (built && built.kpis) setData(built);
  }, [basis]);

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
    ceo:     ["overview", "time", "legal", "severity", "cost"],
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

  // 7그룹 통폐합 네비 — 역할 가시성 반영 후 그룹 구성 (탭 id·컴포넌트는 그대로)
  const _tabById = Object.fromEntries(TABS.map(t => [t.id, t]));
  const visibleGroups = TAB_GROUPS
    .map(g => ({ ...g, items: g.subs.map(id => _tabById[id]).filter(Boolean) }))
    .filter(g => g.items.length > 0);
  const activeGroup = visibleGroups.find(g => g.items.some(t => t.id === tab)) || visibleGroups[0];

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
    <div className="min-h-screen lg:flex" style={{background:"#FFFFFF"}}>
      {/* 좌측 사이드바 (데스크톱) — 모드 공용 */}
      <ModeSidebar dashMode={dashMode} onSwitchMode={switchMode} title="안전 알림 관리" subtitle="㈜아성다이소 · 안전보건팀">
        <SidebarFlatNav items={ALERT_TABS} active={alertTab} onSelect={setAlertTab} />
      </ModeSidebar>

      <div className="flex-1 min-w-0 lg:ml-[232px]">
        {/* 모바일 헤더 + 탭바 (lg:hidden — 데스크톱은 사이드바) */}
        <div className="sticky top-0 z-40 shadow-sm lg:hidden">
          <div className="bg-white border-b border-stone-200">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-center gap-2 sm:gap-4" style={{height:56}}>
              <img src={DAISO_LOGO} alt="DAISO" className="flex-shrink-0" style={{height:32,width:"auto",objectFit:"contain"}} />
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-stone-900 font-extrabold leading-none tracking-tight whitespace-nowrap text-base sm:text-xl">안전 알림 관리</span>
                <span className="text-stone-400 text-[10px] sm:text-xs font-medium leading-none mt-0.5 whitespace-nowrap">㈜아성다이소 · 안전보건팀</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => switchMode("worker")} style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#F5F5F4",color:"#78716C",border:"none"}} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center active:opacity-75">근로자</button>
                <button onClick={() => switchMode("customer")} style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#F5F5F4",color:"#78716C",border:"none"}} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center active:opacity-75">고객</button>
                <button onClick={() => switchMode("alert")} style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#1D4ED8",color:"white",border:"none"}} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center active:opacity-75">알림</button>
              </div>
            </div>
          </div>
          <div className="bg-white border-b border-stone-200">
            <div className="max-w-[1400px] mx-auto px-2 sm:px-4 flex gap-0 overflow-x-auto">
              {ALERT_TABS.map(t => (
                <button key={t.id} onClick={() => setAlertTab(t.id)}
                  className={`min-h-[42px] px-3 py-2.5 text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border-b-2 ${alertTab === t.id ? "border-[#1D4ED8] text-[#003B8F] font-bold" : "border-transparent text-stone-400 hover:text-stone-700"}`}
                  style={{ minWidth: 48, flexShrink: 0 }}>
                  <t.Icon size={13} strokeWidth={2} className="flex-shrink-0" />
                  <span>{t.short}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 데스크톱 슬림 헤더 */}
        <div className="hidden lg:block sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-stone-200">
          <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center">
            <span className="text-stone-900 font-extrabold text-lg tracking-tight">{ALERT_TABS.find(t=>t.id===alertTab)?.l || "안전 알림 관리"}</span>
            <span className="text-stone-400 text-xs ml-2">· 이상치 탐지 기반 선제 알림</span>
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
    </div>
  );

  if (dashMode === "customer") return (
    <CustomerDashboard
      onBack={() => setDashMode("worker")}
      onAlertClick={() => setDashMode("alert")}
      onSwitchMode={switchMode}
    />
  );

  return (
    <div className="min-h-screen pb-14 lg:pb-0 lg:flex" style={{background:"#FFFFFF"}}>

      {/* ═══ 좌측 사이드바 (데스크톱) — 모드 공용 ═══ */}
      <ModeSidebar dashMode={dashMode} onSwitchMode={switchMode} title="안전사고 현황" subtitle="㈜아성다이소 · 안전보건팀">
          {visibleGroups.map(g=>{
            const isActive=g===activeGroup;
            const hasNonAuto=g.items.some(t=>NONAUTO_TABS.has(t.id));
            return (
              <div key={g.id}>
                <button onClick={()=>{const first=g.items[0]; if(first&&!g.items.some(t=>t.id===tab))setTab(first.id);}}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold transition cursor-pointer flex items-center gap-2 ${isActive?"bg-white/15 text-white":"text-white/65 hover:bg-white/[0.08] hover:text-white"}`}>
                  <g.Icon size={15} strokeWidth={2} className="flex-shrink-0" />
                  <span className="flex-1">{g.l}</span>
                  {hasNonAuto && <span title="비자동 포함" className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                </button>
                {isActive && g.items.length>1 && (
                  <div className="ml-[18px] pl-3 border-l border-white/15 flex flex-col gap-0.5 my-1">
                    {g.items.map(t=>(
                      <button key={t.id} onClick={()=>setTab(t.id)}
                        className={`text-left px-2.5 py-1.5 rounded-md text-xs transition cursor-pointer flex items-center gap-1.5 ${tab===t.id?"bg-white text-[#002B6D] font-bold":"text-white/55 hover:text-white hover:bg-white/[0.08]"}`}>
                        <t.Icon size={12} className="flex-shrink-0" />
                        <span className="flex-1">{t.l}</span>
                        {NONAUTO_TABS.has(t.id) && <span className={`text-[8px] font-bold rounded px-1 ${tab===t.id?"bg-amber-100 text-amber-700":"text-amber-300 bg-white/10"}`}>비자동</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </ModeSidebar>

      {/* ═══ 메인 컬럼 ═══ */}
      <div className="flex-1 min-w-0 lg:ml-[232px]">
      {/* ═══ 헤더 (모바일 최적화) ═══ */}
      <div className="sticky top-0 z-40 shadow-sm" style={{animation:"dashSlideDown .4s ease both"}}>

        {/* ── 1행: CI + 회사명 + 모드 토글 (모바일 전용 — 데스크톱은 사이드바) ── */}
        <div className="bg-white border-b border-stone-200 lg:hidden">
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
              <button onClick={() => switchMode("worker")} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center active:opacity-75"
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                  background: DAISO_RED, color:"white", border:"none",
                  transition:"all .2s", transform:"scale(1.05)"}}>
                근로자 사고
              </button>
              <button onClick={() => switchMode("customer")} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center active:opacity-75"
                style={{padding:"5px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                  background:"#F5F5F4", color:"#78716C", border:"none",
                  transition:"all .2s"}}>
                고객 사고
              </button>
              <button onClick={() => switchMode("alert")} className="cursor-pointer whitespace-nowrap min-h-[36px] flex items-center justify-center gap-1 active:opacity-75"
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
          <div className="max-w-[1400px] mx-auto px-3 sm:px-5 h-11 sm:h-10 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {isDefault && (
              <>
                <span className="text-xs text-stone-400 font-medium hidden sm:inline flex-shrink-0">기준:</span>
                <SegmentedToggle
                  value={basis}
                  onChange={setBasis}
                  accent="#071E4A"
                  size="sm"
                  className="flex-shrink-0"
                  options={[{ value: 'incident', label: '사고경위' }, { value: 'approval', label: '산재승인' }]}
                />
                <div className="h-4 w-px bg-stone-200 mx-1 flex-shrink-0" />
              </>
            )}
            <span className="text-xs text-stone-400 font-medium hidden sm:inline flex-shrink-0">기간:</span>
            <SegmentedToggle
              value={yearFilter}
              onChange={setYearFilter}
              accent="#071E4A"
              size="sm"
              className="flex-shrink-0"
              options={[{ value: 'all', label: '전체' }, { value: '2024', label: '2024' }, { value: '2025', label: '2025' }, { value: '2026', label: '2026' }]}
            />
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
            }} className="h-9 sm:h-7 px-2 rounded-md border border-stone-200 text-xs font-medium text-stone-700 bg-white cursor-pointer" style={{ fontFamily: "inherit" }}>
              <option value="">역할 선택</option>
              <option value="ceo">경영진</option>
              <option value="manager">영업부문장</option>
              <option value="team">팀장</option>
              <option value="part">파트장</option>
              <option value="safety">안전보건팀</option>
            </select>
            {dashMode === "worker" && <XlsxBtn D={dataFiltered} filename={`사고현황_${basis === 'approval' ? '산재승인' : '사고경위'}_요약.xlsx`} />}
            {dashMode === "worker" && <button onClick={() => setShowSearch(true)} className="h-9 sm:h-7 px-2.5 rounded-md border border-stone-300 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 cursor-pointer flex items-center gap-1 transition active:opacity-75"><Search size={12} strokeWidth={2} /> 조회</button>}
            {dashMode === "worker" && <button onClick={() => setShowReport(true)} className="h-9 sm:h-7 px-2.5 rounded-md text-white text-xs font-semibold cursor-pointer flex items-center gap-1 transition active:opacity-75" style={{background:"#002B6D"}}><FileText size={12} strokeWidth={2} /> 보고서</button>}
          </div>
        </div>

        {/* ── 옛 상단 탭바 — 사이드바(데스크톱)/하단 네비(모바일)로 대체, 숨김 ── */}
        <div className="hidden">
          {/* 상위: 7개 그룹 */}
          <div className="max-w-[1400px] mx-auto px-2 sm:px-4 flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {visibleGroups.map(g => {
              const isActive = g === activeGroup;
              const hasNonAuto = g.items.some(t => NONAUTO_TABS.has(t.id));
              return (
                <button key={g.id}
                  onClick={() => { const first = g.items[0]; if (first && !g.items.some(t => t.id === tab)) setTab(first.id); }}
                  className={`min-h-[42px] sm:min-h-[46px] px-3 sm:px-4 py-2.5 text-xs sm:text-[13px] font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border-b-2 ${isActive ? "border-stone-900 text-stone-900 font-bold" : "border-transparent text-stone-400 hover:text-stone-700 hover:border-stone-300"}`}
                  style={{ minWidth: 48, flexShrink: 0 }}>
                  <g.Icon size={13} strokeWidth={2} className="flex-shrink-0" />
                  <span>{g.l}</span>
                  {g.items.length > 1 && <span className="text-[9px] text-stone-400 font-normal">{g.items.length}</span>}
                  {hasNonAuto && <span title="비자동 항목 포함" className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          {/* 하위: 활성 그룹의 탭 (2개 이상일 때만) */}
          {activeGroup && activeGroup.items.length > 1 && (
            <div className="max-w-[1400px] mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto py-1.5 bg-stone-50 border-t border-stone-100" style={{ scrollbarWidth: "none" }}>
              {activeGroup.items.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1 flex-shrink-0 ${tab === t.id ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-200"}`}>
                  <t.Icon size={12} strokeWidth={2} className="flex-shrink-0" />
                  {t.l}
                  {NONAUTO_TABS.has(t.id) && (
                    <span title="비자동 — 수동/추정" className={`ml-0.5 text-[8px] font-bold rounded px-1 ${tab === t.id ? "bg-white/20 text-amber-100" : "text-amber-600 bg-amber-50 border border-amber-200"}`}>비자동</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* ═══ 산업재해 현황 대시보드 히어로 타이틀 ═══ */}
      {dashMode === "worker" && (
        <div className="max-w-[1400px] mx-auto px-3 sm:px-5 pt-3 sm:pt-5">
          <div className="rounded-[22px] bg-white/75 border border-stone-200/60 px-5 sm:px-8 py-5 sm:py-6 relative overflow-hidden" style={{ boxShadow: '0 8px 22px rgba(7,30,74,0.05)' }}>
            <div className="text-[11px] font-extrabold tracking-[0.18em] text-[#E60033] flex items-center gap-1.5"><span className="text-[#003B8F]">✦</span> ASUNG DAISO · SAFETY FIRST</div>
            <h1 className="text-2xl sm:text-[34px] font-black text-[#071E4A] mt-1.5 tracking-tight">산업재해 현황 분석 대시보드</h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-2">매장 사고 흐름을 한눈에 보고, 오늘의 안전 행동을 바로 정합니다.</p>
          </div>
        </div>
      )}

      {/* 역할 안내 배너 */}
      {currentRole && (
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 pt-2 sm:pt-3 dash-slide-up">
          <div className="rounded-lg bg-white border border-stone-200 p-3 flex items-start gap-3">
            <div style={{ width: 28, height: 28, borderRadius: 6, background: currentRole === "ceo" ? "#1C1917" : currentRole === "manager" ? "#1D4ED8" : currentRole === "team" ? "#0891B2" : currentRole === "part" ? "#B45309" : DAISO_RED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                {currentRole === "manager" && "영업부문별 비교 · 팀 순위 · 위험지도 · 인적요인"}
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
      
      <div id="dashboard-capture" className="max-w-[1400px] mx-auto px-3 sm:px-4 py-3 sm:py-5">
        <div key={tab} className="dash-slide-up">
          <TabErrorBoundary key={tab}>
            {tab === "overview" && <Overview D={dataFiltered} yearFilter={yearFilter} role={currentRole} setTab={setTab} onStoreSelect={(storeCode) => { if (storeCode) setPreFillStore(storeCode); setTab("riskmap"); }} />}
            {tab === "dept" && <DeptTeamStore D={data} yearFilter={yearFilter} />}
            {tab === "store" && <StoreAnalysis D={dataFiltered} yearFilter={yearFilter} setYearFilter={setYearFilter} />}
            {tab === "riskmap" && <StoreRiskMap D={data} yearFilter={yearFilter} setYearFilter={setYearFilter} syncStoreToUrl={syncStoreToUrl} initStore={preFillStore ?? _INIT_HASH_PARAMS.store} onPreFillConsumed={() => setPreFillStore(null)} />}
            {tab === "time" && <TimeSeries D={data} yearFilter={yearFilter} />}
            {tab === "cross" && <CrossAnalysis D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "human" && <HumanFactors D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "repeat" && <RepeatWorkers D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "repeatstore" && <RepeatStores D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "severity" && <SeverityAnalysis D={data} yearFilter={yearFilter} />}
            {tab === "severestore" && <SevereStores D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "parjang" && <ParjangDashboard D={dataFiltered} yearFilter={yearFilter} />}
            {tab === "cost" && <CostRisk D={dataFiltered} allYearly={data.yearly} yearFilter={yearFilter} basis={basis} />}
            {tab === "legal" && <LegalReporting D={dataFiltered} yearFilter={yearFilter} allYearly={data.yearly} rawKind={data.kind} basis={basis} />}
            {tab === "rawdb" && <RawDbViewer rows={LIVE_SNAPSHOT.rows} approvalRows={LIVE_SNAPSHOT.approvalRows} sheetUrl="https://docs.google.com/spreadsheets/d/1pWfoDWXSowQRHBbIiVDgEd_0oK2XcFxtG4R5Kryvfus/edit" />}
          </TabErrorBoundary>
        </div>
      </div>
      
      <div className="max-w-[1400px] mx-auto px-4 py-4 text-xs text-stone-500 border-t border-stone-100 mt-6 flex justify-between flex-wrap gap-2">
        <div>© ㈜아성다이소 안전보건팀 · v9 · {new Date().getFullYear()}.{String(new Date().getMonth()+1).padStart(2,"0")}</div>
      </div>
      </div>{/* ═══ /메인 컬럼 ═══ */}

      {/* ── 모바일 하단 탭 내비 (640px 미만 = 스마트폰만) ── */}
      {isMobile && <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {visibleGroups.map(g => {
            const isActive = g === activeGroup;
            const hasNonAuto = g.items.some(t => NONAUTO_TABS.has(t.id));
            return (
              <button key={g.id}
                onClick={() => { const first = g.items[0]; if (first && !g.items.some(t => t.id === tab)) setTab(first.id); }}
                className={`flex-1 min-w-[52px] flex flex-col items-center gap-0.5 pt-1.5 pb-1 border-t-2 transition cursor-pointer ${isActive ? "border-[#D70011] text-stone-900" : "border-transparent text-stone-400"}`}>
                <span className="relative inline-flex">
                  <g.Icon size={18} strokeWidth={2} className="flex-shrink-0" />
                  {hasNonAuto && <span className="absolute -top-1 -right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </span>
                <span className="text-[9px] font-semibold leading-tight whitespace-nowrap">{g.short}</span>
              </button>
            );
          })}
        </div>
      </nav>}
      {showReport && <ReportModal D={data} basis={basis} onClose={() => setShowReport(false)} />}
      {showSearch && <DataSearchModal D={data} onClose={() => setShowSearch(false)} />}
    </div>
  );
}
export default App;
