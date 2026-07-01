import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, ChevronDown, Circle, ClipboardList, FileText, Flame, Folder, FolderOpen, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';
import MAP_STORES from '../../../data/storesData.js';
import { requestAiGuide } from '../../../constants/ai.js';
import { track, AI_GUIDE_REQUESTED, AI_GUIDE_RESULT } from '../../../utils/analytics.js';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { normalizeStoreName } from '../../../utils/processStores.js';

// ── 영업부별 경계선 색상 ──────────────────────────────────
const DEPT_COLORS_MAP = {
  '강남/구리영업부':    '#3B82F6',
  '강북영업부':         '#10B981',
  '강원영업부':         '#0369A1',
  '경남영업부':         '#F59E0B',
  '경북영업부':         '#EF4444',
  '관악/평택/안산영업부': '#06B6D4',
  '수원/용인영업부':    '#EC4899',
  '인천영업부':         '#84CC16',
  '충청영업부':         '#F97316',
  '호남영업부':         '#1E40AF',
};

// Andrew's Monotone Chain — O(n log n) convex hull
function convexHull(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat);
  const cross = (o, a, b) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

// accidents[].date 는 정적 데이터(workerData.js)에서 ISO 문자열로 직렬화됨 — Date 로 안전 변환
function toDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}
function ymd(d, sep = "-") {
  const dt = toDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}${sep}${String(dt.getMonth() + 1).padStart(2, "0")}${sep}${String(dt.getDate()).padStart(2, "0")}`;
}

// 카카오 Places(키워드 검색)로 매장 실제 좌표를 재해상한다 — 로드뷰 정확도 향상.
// 정적 storesData(주소 지오코딩)는 도로/건물 차이로 거리뷰가 가끔 엉뚱한 곳을 잡음. Places 가 다이소 사인 위치를 더 정확히 짚는다.
// 차이가 ~2km 이상이면 잘못된 매칭(동명 다른 매장)으로 보고 fallback. SDK services 미로드 시도 fallback.
function resolveStoreCoord(store, callback) {
  const fallback = new window.kakao.maps.LatLng(store.lat, store.lng);
  const services = window.kakao?.maps?.services;
  if (!services?.Places) { callback(fallback); return; }
  try {
    const ps = new services.Places();
    ps.keywordSearch(`다이소 ${store.n}`, (data, status) => {
      if (status !== services.Status.OK || !data?.length) { callback(fallback); return; }
      const hit = data.find(p => (p.place_name || '').includes('다이소')) || data[0];
      const lat = parseFloat(hit.y);
      const lng = parseFloat(hit.x);
      if (Number.isNaN(lat) || Number.isNaN(lng)) { callback(fallback); return; }
      if (Math.abs(lat - store.lat) > 0.02 || Math.abs(lng - store.lng) > 0.02) {
        callback(fallback); return;     // ~2km+ 차이 = 잘못된 매칭(동명) → 안전하게 fallback
      }
      callback(new window.kakao.maps.LatLng(lat, lng));
    });
  } catch { callback(fallback); }
}

function StoreRiskMap({ D = {}, yearFilter = "all", setYearFilter = () => {}, syncStoreToUrl, initStore, onPreFillConsumed }) {
  const [bumFilter, setBumFilter] = useState("전체");
  const [deptFilter, setDeptFilter] = useState("전체");
  const [teamFilter, setTeamFilter] = useState("전체");
  const [showMode, setShowMode] = useState("all");
  const [showDeptBounds, setShowDeptBounds] = useState(false);
  const deptPolygonsRef = useRef([]);
  const [selectedStore, setSelectedStore] = useState(() => {
    // F4: URL 또는 cross-tab preFill에서 초기 매장 복원
    if (initStore) {
      const found = (D.stores || MAP_STORES).find(s => s.n === initStore || normalizeStoreName(s.n) === normalizeStoreName(initStore));
      return found || null;
    }
    return null;
  });

  // cross-tab preFill: initStore prop이 바뀌면 선택 매장 갱신 + 소비 콜백
  const prevInitStore = useRef(initStore);
  useEffect(() => {
    if (initStore && initStore !== prevInitStore.current) {
      prevInitStore.current = initStore;
      const found = (D.stores || MAP_STORES).find(s => s.n === initStore || normalizeStoreName(s.n) === normalizeStoreName(initStore));
      if (found) setSelectedStore(found);
      if (onPreFillConsumed) onPreFillConsumed();
    }
  }, [initStore]);
  const [mapError, setMapError] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");
  const mapRef = useRef(null);
  const kakaoMapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [mapInited, setMapInited] = useState(false);

  // AI 안전가이드 상태
  const [guideText, setGuideText] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState(null);
  const abortRef = useRef(null);

  // 선택된 매장의 사고 레코드 (전체 연도)
  const storeAccidents = useMemo(() => {
    if (!selectedStore || !D.accidents) return [];
    return D.accidents
      .filter(a => a.store === selectedStore.n)
      .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
  }, [selectedStore, D.accidents]);

  // 매장별 사고수 — 라이브 D.accidents 기준. 기준 토글(사고경위↔산재승인) 전환 시
  // D.accidents가 바뀌므로 지도 마커·통계·요약이 즉시 전환된다.
  // (정적 MAP_STORES 카운트 s.tot/y24…는 기준 무관 고정값이라 더는 쓰지 않음)
  const liveCount = useMemo(() => {
    const m = {};
    (D.accidents || []).forEach(a => {
      if (!a.store) return;
      const k = normalizeStoreName(a.store);
      if (!m[k]) m[k] = { tot: 0, y24: 0, y25: 0, y26: 0 };
      m[k].tot++;
      if (a.year === 2024) m[k].y24++;
      else if (a.year === 2025) m[k].y25++;
      else if (a.year === 2026) m[k].y26++;
    });
    return m;
  }, [D.accidents]);

  const getYearCount = useCallback((s) => {
    if (!s) return 0;
    const c = liveCount[normalizeStoreName(s.n)];
    if (!c) return 0;
    if (yearFilter === "2024") return c.y24;
    if (yearFilter === "2025") return c.y25;
    if (yearFilter === "2026") return c.y26;
    return c.tot;
  }, [yearFilter, liveCount]);

  // 영업부/부서/팀 필터 → 기간/위험도 필터 조합 결과
  const filteredStores = useMemo(() => {
    let list = MAP_STORES;
    if (bumFilter  !== "전체") list = list.filter(s => s && s.bm === bumFilter);
    if (deptFilter !== "전체") list = list.filter(s => s && s.dp === deptFilter);
    if (teamFilter !== "전체") list = list.filter(s => s && s.tm === teamFilter);
    if (showMode === "incident") list = list.filter(s => getYearCount(s) > 0);
    return list;
  }, [bumFilter, deptFilter, teamFilter, showMode, yearFilter, getYearCount]);

  // 지도 표시 가능한 매장 (좌표 유효) vs 좌표 누락
  const mappableStores = useMemo(
    () => filteredStores.filter(s =>
      s && typeof s.lat === "number" && typeof s.lng === "number" && s.lat !== 0 && s.lng !== 0
    ),
    [filteredStores]
  );
  const missingCoordCount = filteredStores.length - mappableStores.length;

  const stats = useMemo(() => {
    const inc = filteredStores.filter(s => getYearCount(s) > 0);
    const accidentCount = filteredStores.reduce((sum, s) => sum + getYearCount(s), 0); // 사고 건수(합)
    const top = [...inc].sort((a, b) => getYearCount(b) - getYearCount(a))[0];
    return { total: filteredStores.length, incident: inc.length, safe: filteredStores.length - inc.length, accidentCount, topStore: top || null };
  }, [filteredStores, getYearCount]);

  // 최다 사고 매장 — 라이브 D.accidents 기준(필터 반영). 정적 storesData 카운트는 고정값이라 라이브 실데이터로 산출.
  const liveTopStore = useMemo(() => {
    const recs = (D.accidents || []).filter(a => {
      if (yearFilter === "2024" && a.year !== 2024) return false;
      if (yearFilter === "2025" && a.year !== 2025) return false;
      if (yearFilter === "2026" && a.year !== 2026) return false;
      if (bumFilter !== "전체" && a.bum !== bumFilter) return false;
      if (deptFilter !== "전체" && a.dept !== deptFilter) return false;
      if (teamFilter !== "전체" && a.team !== teamFilter) return false;
      return true;
    });
    const cnt = {};
    recs.forEach(a => { if (a.store) cnt[a.store] = (cnt[a.store] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return top ? { n: top[0], c: top[1] } : null;
  }, [D.accidents, yearFilter, bumFilter, deptFilter, teamFilter]);

  // 선택된 매장이 현재 필터 범위에서 벗어났다면 자동 해제 (stale 선택 정리)
  useEffect(() => {
    if (!selectedStore) return;
    const stillVisible = filteredStores.some(s => s && s.n === selectedStore.n);
    if (!stillVisible) {
      if (syncStoreToUrl) syncStoreToUrl(null); setSelectedStore(null);
      setGuideText("");
      setGuideError(null);
      setRvOpen(false);
      setRvStatus("idle");
      // hover 오버레이 정리
      if (hoverOverlayRef.current) {
        hoverOverlayRef.current.setMap(null);
        hoverOverlayRef.current = null;
      }
    }
  }, [filteredStores, selectedStore]);

  // ── AI 안전가이드 (Bedrock Claude) ───────────────────────
  function buildPrompt(store, accidents, teamIr, deptIr, workerRec, storeWorkerCnt) {
    const byType = {};
    accidents.forEach(a => { byType[a.type || "미상"] = (byType[a.type || "미상"] || 0) + 1; });
    const topType = Object.entries(byType).sort((a,b) => b[1]-a[1]);
    const totalLoss = accidents.reduce((s, a) => s + (a.lossDay || 0), 0);

    const teamRow = (D.team_ir || []).find(t => t.team === store.tm);
    const teamAvgIr = teamRow ? teamRow.ir_per100 : null;
    const teamAvgCov = teamRow ? (teamRow.coverage_rate ?? teamRow.rate) : null;

    const workerInfo = storeWorkerCnt != null
      ? `재직인원: ${storeWorkerCnt}명 | 매장 100명당 IR: ${storeWorkerCnt > 0 ? (accidents.length / storeWorkerCnt * 100).toFixed(2) : "—"}건`
      : "근로자DB 미업로드";

    const accLines = accidents.map(a =>
      [
        ymd(a.date) || `${a.year}년`,
        a.type || "유형미상",
        a.site || "부위미상",
        a.lossDay ? `${a.lossDay}일` : "손실일미상",
        a.content ? a.content.slice(0, 60) : "",
      ].filter(Boolean).join(" | ")
    ).join("\n");

    // 팀 내 순위
    const teamStores = MAP_STORES.filter(s => s.tm === store.tm);
    const sorted = [...teamStores].sort((a,b) => b.tot - a.tot);
    const rank = sorted.findIndex(s => s.n === store.n) + 1;

    return `당신은 ㈜아성다이소 안전보건 전문가입니다. 아래 매장의 실제 사고 데이터를 분석하여 현장 관리자가 즉시 실행 가능한 예방 가이드를 작성해주세요. 반드시 실제 사고 이력 기반으로 작성하고, 구체적인 조치 항목을 제시하세요.

## 매장 기본 정보
- 매장명: ${store.n}
- 부문/부서/팀: ${store.bm} / ${store.dp} / ${store.tm}
- 형태: ${store.fm} | 규모: ${store.ar}평
- ${workerInfo}
- 팀 내 사고건수 순위: ${rank}위 / ${teamStores.length}개 매장
${teamAvgCov != null ? `- 팀 평균 사고발생 매장률: ${teamAvgCov}%` : ""}
${teamAvgIr != null ? `- 팀 평균 100명당 IR: ${teamAvgIr.toFixed(2)}건` : ""}

## 실제 사고 이력 — 전체 ${accidents.length}건 (총 근로손실 ${totalLoss}일)
${accLines || "사고 이력 없음"}

## 재해유형 분포
${topType.map(([t, n]) => `- ${t}: ${n}건 (${Math.round(n/accidents.length*100)}%)`).join("\n")}

## 분석 및 가이드 요청
위 데이터를 바탕으로 다음 형식으로 안전가이드를 작성해주세요:
1. **핵심 위험 요인** (실제 사고 패턴 기반, 2~3가지)
2. **즉시 실행 가능한 조치** (오늘 당장 할 수 있는 것)
3. **정기 점검 항목** (주간/월간)
4. **교육 포인트** (이 매장 직원에게 특히 강조할 내용)

간결하고 실용적으로 작성해주세요.`;
  }

  async function fetchGuide(store) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setGuideText("");
    setGuideError(null);
    setGuideLoading(true);

    const _t0 = performance.now();
    track(AI_GUIDE_REQUESTED, {
      store_code: store?.['매장코드'] ?? store?.['매장'] ?? null,
      store_name: store?.['매장명'] ?? null,
      dept: store?.['부서'] ?? null,
      team: store?.tm ?? null,
    });

    const workerRec = D.worker_kpis ? (D.team_ir || []).find(t => t.team === store.tm) : null;
    const storeWorkerCnt = D.store_workers?.[store.n];
    const prompt = buildPrompt(store, storeAccidents, D.team_ir, D.dept_ir, workerRec, storeWorkerCnt);

    try {
      const result = await requestAiGuide(prompt, { signal: abortRef.current.signal });
      setGuideText(result);
      track(AI_GUIDE_RESULT, {
        success: true,
        latency_ms: Math.round(performance.now() - _t0),
        store_code: store?.['매장코드'] ?? store?.['매장'] ?? null,
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setGuideError(e.message);
        track(AI_GUIDE_RESULT, {
          success: false,
          error_message: e.message,
          latency_ms: Math.round(performance.now() - _t0),
          store_code: store?.['매장코드'] ?? store?.['매장'] ?? null,
        });
      }
    } finally {
      setGuideLoading(false);
    }
  }

  // ── Kakao SDK 초기화 ─────────────────────────────────────
  // 컴포넌트 마운트 시 kakao.maps.load() 호출만 하면 됨.
  useEffect(() => {
    let cancelled = false;

    function tryInit() {
      if (cancelled) return;
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          if (cancelled) return;
          initMap();
        });
      } else {
        // SDK가 아직 파싱 중이면 100ms 후 재시도 (최대 15초)
        retryRef.current += 1;
        if (retryRef.current < 150) {
          setTimeout(tryInit, 100);
        } else {
          setMapError({ type: "timeout", msg: "Kakao 지도 SDK가 15초 내 응답하지 않았습니다. 도메인 등록 또는 JavaScript 키를 확인해주세요." });
          setMapStatus("error");
        }
      }
    }

    tryInit();
    return () => { cancelled = true; };
  }, []);

  const retryRef = useRef(0);

  // 로드뷰 상태
  const [rvOpen, setRvOpen] = useState(false);
  const [rvStatus, setRvStatus] = useState("idle"); // idle / loading / ready / error
  const rvRef = useRef(null);
  const rvInstanceRef = useRef(null);

  // 라벨 정책: hover 툴팁 / 선택 영구 라벨 / 줌 레벨 인지
  const hoverOverlayRef = useRef(null);          // hover 시 임시 표시 오버레이
  const [mapLevel, setMapLevel] = useState(13);  // 카카오 level: 작을수록 확대 (1~14)
  const HOVER_LEVEL_MAX = 9;                     // 이 레벨 이하(=확대 상태)에서만 hover 툴팁 활성

  // 매장 상세 Drawer
  const [drawerTab, setDrawerTab] = useState("basic"); // basic | hr | accident | map | roadview | ai
  const drawerOpen = !!selectedStore;
  const drawerMapRef = useRef(null);          // drawer 내부 미니맵 DOM
  const drawerMapInstanceRef = useRef(null);  // 미니맵 인스턴스
  const drawerSkyRef = useRef(null);          // drawer 스카이뷰 DOM
  const drawerSkyMapRef = useRef(null);       // 스카이뷰 인스턴스
  const drawerRvRef = useRef(null);           // drawer 내부 로드뷰 DOM
  const drawerRvInstanceRef = useRef(null);   // drawer 내부 로드뷰 인스턴스
  const [drawerRvStatus, setDrawerRvStatus] = useState("idle"); // idle/loading/ready/error
  const drawerCloseBtnRef = useRef(null);

  // ESC 닫기 + 스크롤 잠금
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSelectedStore(null);
        setGuideText("");
        setGuideError(null);
        setRvOpen(false);
        setRvStatus("idle");
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus drawer 내부 닫기 버튼
    setTimeout(() => drawerCloseBtnRef.current?.focus(), 80);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  // drawer 매장 변경 시 탭 초기화 + 내부 로드뷰 정리
  useEffect(() => {
    if (selectedStore) {
      setDrawerTab("basic");
      setDrawerRvStatus("idle");
    }
    if (drawerRvInstanceRef.current) {
      drawerRvInstanceRef.current = null;
    }
  }, [selectedStore?.n]);

  // drawer 미니맵 초기화 — '지도' 탭 활성화 시
  useEffect(() => {
    if (!drawerOpen || drawerTab !== "map") return;
    if (!selectedStore || typeof selectedStore.lat !== "number" || typeof selectedStore.lng !== "number") return;
    if (!window.kakao || !window.kakao.maps) return;
    setTimeout(() => {
      if (!drawerMapRef.current) return;
      const { kakao } = window;
      const pos = new kakao.maps.LatLng(selectedStore.lat, selectedStore.lng);
      // 매번 새로 생성 (다른 매장 선택 시 갱신)
      drawerMapInstanceRef.current = new kakao.maps.Map(drawerMapRef.current, {
        center: pos, level: 4,
      });
      // 마커 — 위험도 컬러
      const cnt = getYearCount(selectedStore) || 0;
      const color = cnt >= 3 ? RISK_COLORS.high : cnt === 2 ? RISK_COLORS.mid : cnt === 1 ? RISK_COLORS.low : RISK_COLORS.safe;
      new kakao.maps.CustomOverlay({
        map: drawerMapInstanceRef.current,
        position: pos,
        content: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 3px ${color}55,0 2px 8px rgba(0,0,0,.3);"></div>`,
        yAnchor: 0.5,
      });
    }, 100);
  }, [drawerOpen, drawerTab, selectedStore?.n]);

  // drawer 로드뷰 초기화 — '로드뷰' 탭 활성화 시
  useEffect(() => {
    if (!drawerOpen || drawerTab !== "roadview") return;
    if (!selectedStore || typeof selectedStore.lat !== "number" || typeof selectedStore.lng !== "number") {
      setDrawerRvStatus("error");
      return;
    }
    if (!window.kakao || !window.kakao.maps) {
      setDrawerRvStatus("error");
      return;
    }
    setDrawerRvStatus("loading");
    setTimeout(() => {
      if (!drawerRvRef.current) return;
      const { kakao } = window;
      resolveStoreCoord(selectedStore, (pos) => {
        const client = new kakao.maps.RoadviewClient();
        client.getNearestPanoId(pos, 50, (panoId) => {
          if (!panoId) { setDrawerRvStatus("error"); return; }
          if (!drawerRvRef.current) return;
          drawerRvInstanceRef.current = new kakao.maps.Roadview(drawerRvRef.current);
          drawerRvInstanceRef.current.setPanoId(panoId, pos);
          setDrawerRvStatus("ready");
        });
      });
    }, 100);
  }, [drawerOpen, drawerTab, selectedStore?.n]);

  function initMap() {
    if (!mapRef.current || kakaoMapRef.current) return;
    try {
      const { kakao } = window;
      // 전국 중심점 (1,337개 매장 centroid 기준)
      kakaoMapRef.current = new kakao.maps.Map(mapRef.current, {
        center: new kakao.maps.LatLng(36.6487, 127.5102),
        level: 13,
      });
      // 초기 로드 시 전체 매장 bounds 자동 맞춤
      const bounds = new kakao.maps.LatLngBounds();
      MAP_STORES.forEach(s => bounds.extend(new kakao.maps.LatLng(s.lat, s.lng)));
      kakaoMapRef.current.setBounds(bounds, 40);
      // 줌 레벨 추적 — hover 툴팁 + 매장명 라벨 제어
      setMapLevel(kakaoMapRef.current.getLevel());
      kakao.maps.event.addListener(kakaoMapRef.current, "zoom_changed", () => {
        const lv = kakaoMapRef.current.getLevel();
        setMapLevel(lv);
        // 매장명 라벨: level ≤ 7이면 사고 매장 표시, ≤ 5면 전체
        document.querySelectorAll('[data-slabel]').forEach(el => {
          const forIncident = el.getAttribute('data-slabel') === 'inc';
          el.style.display = (lv <= 5 || (lv <= 7 && forIncident)) ? 'block' : 'none';
        });
      });
      setMapInited(true);
      setMapStatus("ready");
    } catch (e) {
      setMapError({ type: "init_failed", msg: "지도 생성 실패: " + e.message + " — 도메인이 카카오 콘솔에 등록되어 있는지 확인해주세요." });
      setMapStatus("error");
    }
  }

  // ── Drawer 스카이뷰 초기화 ────────────────────────────────
  useEffect(() => {
    if (!drawerOpen || !selectedStore || !window.kakao?.maps) return;
    if (typeof selectedStore.lat !== 'number' || !drawerSkyRef.current) return;
    drawerSkyMapRef.current = null;
    const { kakao } = window;
    const pos = new kakao.maps.LatLng(selectedStore.lat, selectedStore.lng);
    const skyMap = new kakao.maps.Map(drawerSkyRef.current, { center: pos, level: 3 });
    skyMap.setMapTypeId(kakao.maps.MapTypeId.SKYVIEW);
    skyMap.setDraggable(false);
    skyMap.setZoomable(false);
    new kakao.maps.CustomOverlay({
      map: skyMap,
      position: pos,
      content: `<div style="width:14px;height:14px;border-radius:50%;background:#D70011;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
      yAnchor: 0.5,
    });
    drawerSkyMapRef.current = skyMap;
  }, [drawerOpen, selectedStore?.n]);

  // 로드뷰 열기 — Places 로 매장 실제 좌표 재해상 후 가장 가까운 pano 표시
  function openRoadview(store) {
    setRvOpen(true);
    setRvStatus("loading");
    setTimeout(() => {
      if (!rvRef.current) { setRvStatus("error"); return; }
      const { kakao } = window;
      resolveStoreCoord(store, (pos) => {
        const client = new kakao.maps.RoadviewClient();
        client.getNearestPanoId(pos, 50, (panoId) => {
          if (!panoId) { setRvStatus("error"); return; }
          if (!rvInstanceRef.current) {
            rvInstanceRef.current = new kakao.maps.Roadview(rvRef.current);
          }
          rvInstanceRef.current.setPanoId(panoId, pos);
          setRvStatus("ready");
        });
      });
    }, 80);
  }

  // zoom_changed 시 hover 상태만 갱신 — 마커 전체 재생성 없이 ref로 처리
  const hoverEnabledRef = useRef(false);
  useEffect(() => {
    hoverEnabledRef.current = mapLevel <= HOVER_LEVEL_MAX && mappableStores.length <= 200;
  }, [mapLevel, mappableStores.length]);

  // 마커 업데이트 — 기본: 마커만 / 선택 매장: 영구 라벨 / hover: 임시 툴팁(별도 오버레이)
  // ※ mapLevel을 deps에서 제외 — zoom 시 1,337개 재생성 방지. hover 활성은 hoverEnabledRef로 체크
  useEffect(() => {
    if (!mapInited || !kakaoMapRef.current) return;
    const { kakao } = window;
    const map = kakaoMapRef.current;
    // 항상 모든 기존 오버레이 제거 (필터 변경 시 stale 마커 방지)
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    // hover 오버레이도 정리
    if (hoverOverlayRef.current) {
      hoverOverlayRef.current.setMap(null);
      hoverOverlayRef.current = null;
    }

    // 표시 가능 매장이 없으면 마커 없이 빈 상태로 둠 (UI에서 안내문구 표시)
    if (mappableStores.length === 0) {
      return;
    }

    // hover 활성화 여부 — ref로 읽어 재렌더 없이 처리
    const hoverEnabled = hoverEnabledRef.current;

    mappableStores.forEach(store => {
      const cnt = getYearCount(store) || 0;
      const color = cnt >= 3 ? RISK_COLORS.high : cnt === 2 ? RISK_COLORS.mid : cnt === 1 ? RISK_COLORS.low : RISK_COLORS.safe;
      const sz   = cnt >= 3 ? 16 : cnt >= 1 ? 12 : 7;

      const safeName  = store.n.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
      const isSelected = selectedStore && selectedStore.n === store.n;

      let content;
      if (isSelected && cnt >= 0) {
        // ▶ 선택 매장: 마커 + 영구 라벨 (보조 정보 — 매장명 + 사고 N건)
        const htmlName = store.n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const short    = htmlName.length > 10 ? htmlName.slice(0, 10) + "…" : htmlName;
        content = `
          <div data-store="${safeName}" onclick="window.__storeClick('${safeName}')"
            style="position:relative;cursor:pointer;display:flex;flex-direction:column;align-items:center;">
            <div style="width:${Math.max(sz, 12)}px;height:${Math.max(sz, 12)}px;border-radius:50%;
              background:${color};border:2px solid rgba(255,255,255,.95);
              box-shadow:0 0 0 3px ${color}40, 0 2px 8px rgba(0,0,0,.25);
              transition:transform .12s;"></div>
            <div style="
              margin-top:4px;
              background:rgba(255,255,255,0.96);
              border:1.5px solid ${color};
              box-shadow:0 2px 10px rgba(0,0,0,.16);
              border-radius:7px;
              padding:3px 7px 3px 6px;
              display:flex;align-items:center;gap:5px;
              max-width:130px;
              pointer-events:none;
              white-space:nowrap;overflow:hidden;">
              <span style="width:5px;height:5px;min-width:5px;border-radius:50%;background:${color};"></span>
              <span style="font-size:11px;font-weight:700;color:#111827;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;
                letter-spacing:-.1px;">${short}</span>
              <span style="font-size:10px;color:#6B7280;font-weight:500;">· 사고 ${cnt}건</span>
            </div>
          </div>`;
      } else {
        // ▶ 일반 마커 + 줌 레벨 기반 매장명 라벨
        const hoverHandlers = hoverEnabled
          ? `onmouseover="window.__storeHover('${safeName}', ${store.lat}, ${store.lng}, ${cnt})"
             onmouseout="window.__storeHoverOut()"`
          : "";
        const opacity = cnt > 0 ? 1 : 0.55;
        const baseTransform = `transition:opacity .12s,transform .12s;opacity:${opacity};`;
        // 라벨: level ≤ 7 = 사고 매장, level ≤ 5 = 전체. 초기 display는 현재 mapLevel 기준
        const labelType = cnt > 0 ? 'inc' : 'all';
        const labelInit = (mapLevel <= 5 || (mapLevel <= 7 && cnt > 0)) ? 'block' : 'none';
        const htmlName = store.n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const shortName = htmlName.length > 10 ? htmlName.slice(0,10) + "…" : htmlName;
        const labelHtml = `<div data-slabel="${labelType}" style="
          display:${labelInit};position:absolute;top:calc(100% + 3px);left:50%;
          transform:translateX(-50%);
          background:rgba(255,255,255,.95);border:1px solid ${color};border-radius:4px;
          padding:1px 5px;font-size:10px;font-weight:600;color:#111827;
          white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 4px rgba(0,0,0,.14);
        ">${shortName}</div>`;
        content = `<div data-store="${safeName}"
          onclick="window.__storeClick('${safeName}')"
          ${hoverHandlers}
          style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;
            background:${color};
            border:${cnt > 0 ? "2px solid rgba(255,255,255,.92)" : "1px solid rgba(255,255,255,.6)"};
            box-shadow:${cnt > 0 ? "0 2px 6px rgba(0,0,0,.28)" : "none"};
            cursor:pointer;${baseTransform}"
          onmouseenter="this.style.transform='scale(1.4)';this.style.opacity='1'"
          onmouseleave="this.style.transform='scale(1)';this.style.opacity='${opacity}'"
          >${labelHtml}</div>`;
      }

      const overlay = new kakao.maps.CustomOverlay({
        map,
        position: new kakao.maps.LatLng(store.lat, store.lng),
        content,
        yAnchor: isSelected ? 1.0 : 0.5,
        zIndex: isSelected ? 40 : cnt >= 3 ? 30 : cnt > 0 ? 20 : 1,
      });
      overlaysRef.current.push(overlay);
    });

    // 클릭 핸들러
    window.__storeClick = (name) => {
      const s = MAP_STORES.find(x => x.n === name);
      if (s) {
        // 기존 hover 오버레이 정리
        if (hoverOverlayRef.current) {
          hoverOverlayRef.current.setMap(null);
          hoverOverlayRef.current = null;
        }
        setSelectedStore(s);
        setGuideText("");
        setGuideError(null);
        setRvOpen(false);
        setRvStatus("idle");
        // Drawer(~560px)가 우측을 덮으므로 마커를 화면 좌측으로 오프셋
        if (kakaoMapRef.current) {
          kakaoMapRef.current.panTo(new kakao.maps.LatLng(s.lat, s.lng));
          // 패닝 후 drawer 너비만큼 왼쪽으로 이동 (px 단위 오프셋)
          setTimeout(() => {
            if (kakaoMapRef.current) {
              kakaoMapRef.current.panBy(-240, 0);
            }
          }, 200);
        }
      }
    };

    // hover 핸들러 — 별도 오버레이로 임시 툴팁
    window.__storeHover = (name, lat, lng, cnt) => {
      if (!kakaoMapRef.current || !window.kakao) return;
      // 기존 hover 정리
      if (hoverOverlayRef.current) {
        hoverOverlayRef.current.setMap(null);
        hoverOverlayRef.current = null;
      }
      const htmlName = name.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const short    = htmlName.length > 12 ? htmlName.slice(0, 12) + "…" : htmlName;
      const c = cnt >= 3 ? RISK_COLORS.high : cnt === 2 ? RISK_COLORS.mid : cnt === 1 ? RISK_COLORS.low : RISK_COLORS.safe;
      const tooltipContent = `
        <div style="
          position:relative;
          background:rgba(255,255,255,0.97);
          border:1px solid #e5e7eb;
          box-shadow:0 4px 14px rgba(0,0,0,.14);
          border-radius:6px;
          padding:4px 8px 4px 7px;
          display:inline-flex;align-items:center;gap:5px;
          max-width:160px;
          pointer-events:none;
          white-space:nowrap;
          margin-bottom:8px;
          transform:translateY(-4px);">
          <span style="width:6px;height:6px;min-width:6px;border-radius:50%;background:${c};"></span>
          <span style="font-size:11px;font-weight:600;color:#111827;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;letter-spacing:-.1px;">${short}</span>
          ${cnt > 0
            ? `<span style="font-size:10px;color:#6B7280;font-weight:500;">· 사고 ${cnt}건</span>`
            : `<span style="font-size:10px;color:#9CA3AF;">· 사고 없음</span>`}
        </div>`;
      hoverOverlayRef.current = new window.kakao.maps.CustomOverlay({
        map: kakaoMapRef.current,
        position: new window.kakao.maps.LatLng(lat, lng),
        content: tooltipContent,
        yAnchor: 1.0,
        zIndex: 50,
      });
    };
    window.__storeHoverOut = () => {
      if (hoverOverlayRef.current) {
        hoverOverlayRef.current.setMap(null);
        hoverOverlayRef.current = null;
      }
    };

    // 필터 적용 시 범위 조정 — 표시 가능한 매장만
    if ((bumFilter !== "전체" || deptFilter !== "전체" || teamFilter !== "전체") && mappableStores.length > 0) {
      const bounds = new kakao.maps.LatLngBounds();
      mappableStores.forEach(s => bounds.extend(new kakao.maps.LatLng(s.lat, s.lng)));
      map.setBounds(bounds, 60);
    }

    return () => {
      // cleanup hover overlay on unmount or filter change
      if (hoverOverlayRef.current) {
        hoverOverlayRef.current.setMap(null);
        hoverOverlayRef.current = null;
      }
    };
  }, [mapInited, mappableStores, yearFilter, getYearCount, selectedStore, bumFilter, deptFilter, teamFilter]);

  // ── 영업부 경계 폴리곤 ────────────────────────────────────
  useEffect(() => {
    if (!mapInited || !kakaoMapRef.current || !window.kakao?.maps) return;
    const { kakao } = window;
    deptPolygonsRef.current.forEach(p => p.setMap(null));
    deptPolygonsRef.current = [];
    if (!showDeptBounds) return;
    const groups = {};
    mappableStores.forEach(s => {
      if (!groups[s.dp]) groups[s.dp] = [];
      groups[s.dp].push({ lat: s.lat, lng: s.lng });
    });
    Object.entries(groups).forEach(([dp, pts]) => {
      if (pts.length < 3) return;
      const hull = convexHull(pts);
      const color = DEPT_COLORS_MAP[dp] || '#6B7280';
      const polygon = new kakao.maps.Polygon({
        map: kakaoMapRef.current,
        path: hull.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 2,
        strokeColor: color,
        strokeOpacity: 0.85,
        fillColor: color,
        fillOpacity: 0.07,
      });
      deptPolygonsRef.current.push(polygon);
    });
  }, [mapInited, showDeptBounds, mappableStores]);

  // ── 계층 데이터 ───────────────────────────────────────────
  const TREE = [
    { bum: "수도권", color: "#2563EB", depts: [
      { name: "강남/구리영업부", teams: ["강남팀","강동팀","구리팀"] },
      { name: "강북영업부",     teams: ["강북팀","신촌팀","종로팀"] },
      { name: "관악/평택/안산영업부", teams: ["관악팀","평택팀","안산팀"] },
      { name: "수원/용인영업부", teams: ["수원팀","용인팀"] },
      { name: "인천영업부",     teams: ["남인천팀","북인천팀","일산팀"] },
    ]},
    { bum: "지방", color: "#EA580C", depts: [
      { name: "강원영업부", teams: ["강릉속초팀","춘천원주팀"] },
      { name: "경남영업부", teams: ["동부산팀","서부산팀","창원팀"] },
      { name: "경북영업부", teams: ["경북팀","대구팀","울산팀"] },
      { name: "충청영업부", teams: ["대전팀","충남팀","충북팀"] },
      { name: "호남영업부", teams: ["전남팀","전북팀","제주팀"] },
    ]},
  ];

  // 트리 열림 상태
  const [expandedBum, setExpandedBum] = useState(new Set(["수도권","지방"]));
  const [expandedDept, setExpandedDept] = useState(new Set());
  // 모바일(<1024px)에서는 조직 트리를 기본 접힘 — 지도가 전체폭을 쓰도록
  const [treeOpen, setTreeOpen] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= 1024
  );
  const [storeSearch, setStoreSearch] = useState(""); // 매장 검색어
  const storeSearchRef = useRef(null);

  // 매장 검색 결과 (검색어 있을 때만 활성)
  const searchResults = useMemo(() => {
    const q = storeSearch.trim();
    if (!q || q.length < 1) return null;
    return MAP_STORES.filter(s =>
      s.n && s.n.includes(q)
    ).slice(0, 30); // 최대 30개
  }, [storeSearch]);

  const toggleBum  = (b) => setExpandedBum(prev  => { const s = new Set(prev); s.has(b)  ? s.delete(b)  : s.add(b);  return s; });
  const toggleDept = (d) => setExpandedDept(prev => { const s = new Set(prev); s.has(d)  ? s.delete(d)  : s.add(d);  return s; });

  // 선택 핸들러 — 선택 즉시 지도 bounds 이동은 마커 useEffect가 처리
  const selectBum  = (b) => {
    setBumFilter(b);
    setDeptFilter("전체");
    setTeamFilter("전체");
    // 다른 부문 선택 시 부서 트리 전부 접기
    setExpandedDept(new Set());
  };
  const selectDept = (d, b) => { setBumFilter(b); setDeptFilter(d);      setTeamFilter("전체"); };
  const selectTeam = (t, d, b) => { setBumFilter(b); setDeptFilter(d); setTeamFilter(t); };
  const selectAll  = () => {
    setBumFilter("전체");
    setDeptFilter("전체");
    setTeamFilter("전체");
    setExpandedDept(new Set());
  };

  // 레벨별 사고·매장 집계 (트리 라벨용)
  const storesByBum  = useMemo(() => {
    const m = {};
    MAP_STORES.forEach(s => { if (!m[s.bm]) m[s.bm] = { total:0, inc:0 }; m[s.bm].total++; if (getYearCount(s)>0) m[s.bm].inc++; });
    return m;
  }, [yearFilter]);
  const storesByDept = useMemo(() => {
    const m = {};
    MAP_STORES.forEach(s => { if (!m[s.dp]) m[s.dp] = { total:0, inc:0 }; m[s.dp].total++; if (getYearCount(s)>0) m[s.dp].inc++; });
    return m;
  }, [yearFilter]);
  const storesByTeam = useMemo(() => {
    const m = {};
    MAP_STORES.forEach(s => { if (!m[s.tm]) m[s.tm] = { total:0, inc:0 }; m[s.tm].total++; if (getYearCount(s)>0) m[s.tm].inc++; });
    return m;
  }, [yearFilter]);

  const yearLabel = yearFilter === "all" ? "전체" : yearFilter + "년";

  // ── KPI 카운트업 ─────────────────────────────────────────
  const kpiRef     = useRef(null);
  const kpiInView  = useInView(kpiRef);
  const cuTotal    = useCountUp(stats.total,    900, kpiInView);
  const cuIncident = useCountUp(stats.incident, 900, kpiInView);
  const cuAccidents = useCountUp(stats.accidentCount, 900, kpiInView);
  const cuSafe     = useCountUp(stats.safe,     900, kpiInView);
  const cuTopC     = useCountUp(liveTopStore?.c ?? 0, 900, kpiInView);

  // 현재 선택 경로 표시 (breadcrumb)
  const breadcrumb = [
    bumFilter !== "전체" ? bumFilter : null,
    deptFilter !== "전체" ? deptFilter : null,
    teamFilter !== "전체" ? teamFilter : null,
  ].filter(Boolean).join(" › ");

  return (
    <div className="space-y-3">

      {/* ── 상단 바: 표시 모드 (기간은 상단 글로벌 토글 사용) ── */}
      <div className="bg-white border border-stone-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-stone-500">표시</span>
        {[["all","전체 매장"],["incident","사고 발생만"]].map(([v,l]) => (
          <button key={v} onClick={() => setShowMode(v)}
            className={`px-2.5 py-1 rounded-md text-xs border transition-all duration-200 ${showMode===v ? (v==="incident" ? "bg-[#D70011] text-white border-[#D70011]" : "bg-stone-800 text-white border-stone-800") : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
            {l}
          </button>
        ))}
        <div className="w-px h-4 bg-stone-200 mx-1" />
        <button onClick={() => setShowDeptBounds(v => !v)}
          className={`px-2.5 py-1 rounded-md text-xs border transition-all duration-200 flex items-center gap-1 ${showDeptBounds ? "bg-[#071E4A] text-white border-[#071E4A]" : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
          영업부 경계
        </button>
        {/* 모바일: 트리 토글 버튼 */}
        <button onClick={() => setTreeOpen(o => !o)}
          className="ml-auto lg:hidden px-2.5 py-1 rounded-md text-xs border border-stone-200 bg-white text-stone-600 flex items-center gap-1 transition-all duration-200">
          <GitBranch size={13} /> 조직 {treeOpen ? "접기" : "펼치기"}
        </button>
      </div>

      {/* ── KPI 타일 ── */}
      <div ref={kpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {l:"표시 매장",         v:`${cuTotal.toLocaleString()}개`,                        c:"text-stone-900"},
          {l:`${yearLabel} 사고`,  v:`${cuAccidents.toLocaleString()}건`, sub:`발생 매장 ${cuIncident.toLocaleString()}개`, c:"text-[#D70011]"},
          {l:"무사고 매장",       v:`${cuSafe.toLocaleString()}개`,                         c:"text-stone-500"},
          {l:"최다 사고 매장",    v:liveTopStore ? `${liveTopStore.n} (${cuTopC}건)` : "-", c:"text-stone-800"},
        ].map((k, i) => (
          <div key={k.l}
            className="bg-white border border-stone-200 rounded-lg p-3 dash-slide-up"
            style={{animationDelay:`${i * 0.06}s`}}>
            <div className="text-[11px] text-stone-400 mb-1">{k.l}</div>
            <div className={"text-sm font-semibold truncate "+k.c}>{k.v}</div>
            {k.sub && <div className="text-[10px] text-stone-400 mt-0.5 truncate">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── 본체: 트리 패널 + 지도 ── */}
      <div className="flex flex-col lg:flex-row gap-3 items-start">

        {/* 계층 트리 패널 */}
        {treeOpen && (
          <div className="flex-shrink-0 w-full lg:w-56 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col" style={{height: rvOpen ? "calc(260px + 2.5rem + 200px)" : 480}}>
            {/* 헤더 */}
            <div className="px-3 py-2 border-b border-stone-100 flex items-center justify-between bg-stone-50 flex-shrink-0">
              <span className="text-xs font-semibold text-stone-600">조직별 필터</span>
              <button onClick={selectAll}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${bumFilter==="전체" ? "bg-stone-700 text-white border-stone-700" : "bg-white border-stone-200 text-stone-500 hover:bg-stone-100"}`}>
                전체 보기
              </button>
            </div>

            {/* 매장 검색창 */}
            <div className="px-2.5 py-2 border-b border-stone-100 flex-shrink-0">
              <div className="relative">
                <input
                  ref={storeSearchRef}
                  type="text"
                  value={storeSearch}
                  onChange={e => setStoreSearch(e.target.value)}
                  placeholder="매장명 검색..."
                  className="w-full text-xs rounded-md border border-stone-200 bg-white px-2.5 py-1.5 pr-7 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
                />
                {storeSearch ? (
                  <button onClick={() => setStoreSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm leading-none cursor-pointer">✕</button>
                ) : (
                  <Search size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-300 pointer-events-none" />
                )}
              </div>
            </div>

            {/* 검색 결과 패널 */}
            {searchResults !== null && (
              <div className="flex-shrink-0 border-b border-stone-100 bg-white max-h-52 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-stone-400 text-center">검색 결과 없음</div>
                ) : (
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] text-stone-400 font-semibold uppercase tracking-wide">{searchResults.length}개 매장</div>
                    {searchResults.map(s => {
                      const cnt = getYearCount(s) || 0;
                      const color = cnt >= 3 ? RISK_COLORS.high : cnt === 2 ? RISK_COLORS.mid : cnt >= 1 ? RISK_COLORS.low : RISK_COLORS.safe;
                      return (
                        <button key={s.n} onClick={() => {
                          // 해당 매장의 팀/부서/부문으로 필터 이동 후 매장 선택
                          setBumFilter(s.bm);
                          setDeptFilter(s.dp);
                          setTeamFilter(s.tm);
                          setExpandedDept(new Set([s.dp]));
                          setSelectedStore(s);
                          setGuideText("");
                          setGuideError(null);
                          setRvOpen(false);
                          setRvStatus("idle");
                          if (kakaoMapRef.current && window.kakao) {
                            kakaoMapRef.current.panTo(new window.kakao.maps.LatLng(s.lat, s.lng));
                            setTimeout(() => kakaoMapRef.current?.panBy(-240, 0), 200);
                          }
                        }}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-stone-50 transition-colors">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}}/>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-stone-800 truncate">{s.n}</div>
                            <div className="text-[10px] text-stone-400 truncate">{s.dp} · {s.tm}{cnt > 0 ? ` · 사고 ${cnt}건` : ""}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* breadcrumb */}
            {breadcrumb && !storeSearch && (
              <div className="px-3 py-1.5 border-b border-stone-100 text-[10px] text-stone-400 flex items-center gap-1 flex-shrink-0 bg-stone-50/50 min-w-0">
                <MapPin size={10} className="flex-shrink-0" /><span className="truncate">{breadcrumb}</span>
              </div>
            )}

            {/* 트리 — 스크롤 영역 (min-h-0: flex-col 내 자식이 줄어들어 스크롤되도록 — 없으면 패널 넘쳐 잘림) */}
            <div className="flex-1 min-h-0 overflow-y-auto py-1" style={{scrollbarWidth:"thin", scrollbarColor:"#D6D3D1 transparent"}}>
              {TREE.map(({ bum, color, depts }) => {
                const bs = storesByBum[bum] || { total:0, inc:0 };
                const isBumSel = bumFilter === bum && deptFilter === "전체";
                const isBumExp = expandedBum.has(bum);
                return (
                  <div key={bum}>
                    {/* 부문 행 */}
                    <div className={`flex items-center gap-1 mx-1.5 my-0.5 px-2 py-2 cursor-pointer select-none rounded-lg transition-colors
                      ${isBumSel ? "bg-stone-800" : "hover:bg-stone-50"}`}>
                      <button onClick={() => toggleBum(bum)} className="w-5 h-5 flex items-center justify-center flex-shrink-0 rounded hover:bg-black/10 transition-colors">
                        {isBumExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button onClick={() => selectBum(bum)} className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                          <span className={`text-xs font-bold ${isBumSel ? "text-white" : "text-stone-800"}`}>{bum}</span>
                        </div>
                        <div className={`text-[10px] pl-4 mt-0.5 ${isBumSel ? "text-white/60" : "text-stone-400"}`}>
                          매장 {bs.total} · 사고 {bs.inc}
                        </div>
                      </button>
                    </div>

                    {/* 부서 목록 */}
                    {isBumExp && depts.map(({ name: dept, teams }) => {
                      const ds = storesByDept[dept] || { total:0, inc:0 };
                      const isDeptSel = deptFilter === dept && teamFilter === "전체";
                      const isDeptExp = expandedDept.has(dept);
                      return (
                        <div key={dept}>
                          {/* 부서 행 */}
                          <div className={`flex items-center gap-1 mx-1.5 ml-4 my-0.5 px-2 py-1.5 cursor-pointer select-none rounded-lg transition-colors
                            ${isDeptSel ? "bg-stone-700" : "hover:bg-stone-50"}`}>
                            <button onClick={() => toggleDept(dept)} className="w-5 h-5 flex items-center justify-center flex-shrink-0 rounded hover:bg-black/10 transition-colors">
                              {isDeptExp ? <FolderOpen size={14} className="text-amber-500"/> : <Folder size={14} className="text-stone-400"/>}
                            </button>
                            <button onClick={() => selectDept(dept, bum)} className="flex-1 text-left min-w-0">
                              <div className={`text-xs font-medium truncate leading-tight ${isDeptSel ? "text-white" : "text-stone-700"}`}>{dept}</div>
                              <div className={`text-[10px] mt-0.5 ${isDeptSel ? "text-white/60" : "text-stone-400"}`}>매장 {ds.total} · 사고 {ds.inc}</div>
                            </button>
                          </div>

                          {/* 팀 목록 */}
                          {isDeptExp && teams.map(team => {
                            const ts = storesByTeam[team] || { total:0, inc:0 };
                            const isTeamSel = teamFilter === team;
                            return (
                              <button key={team} onClick={() => selectTeam(team, dept, bum)}
                                className={`w-full text-left flex items-center gap-2 mx-1.5 ml-8 my-0.5 px-2 py-1.5 rounded-lg transition-colors
                                  ${isTeamSel ? "bg-stone-100 ring-1 ring-stone-300" : "hover:bg-stone-50"}`}
                                style={{width:"calc(100% - 2.5rem)"}}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background: isTeamSel ? color : "#D6D3D1"}} />
                                <div className="min-w-0 flex-1">
                                  <div className={`text-xs truncate leading-tight ${isTeamSel ? "text-stone-900 font-semibold" : "text-stone-600"}`}>{team}</div>
                                  <div className="text-[10px] text-stone-400">매장 {ts.total} · 사고 {ts.inc}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 지도 + 로드뷰 분할 */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* 지도 */}
          <div className="relative rounded-xl border border-stone-200" style={{height: rvOpen ? 260 : 480, overflow:"hidden"}}>
            {mapStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-50 z-10">
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    <div className="w-8 h-8 border-[3px] border-stone-200 border-t-[#071E4A] rounded-full animate-spin" />
                  </div>
                  <div className="text-sm font-semibold text-stone-600">지도 로딩 중...</div>
                  <div className="text-xs text-stone-400 mt-1">최대 15초 소요</div>
                </div>
              </div>
            )}
            {mapStatus === "error" && mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-50 z-10 overflow-y-auto">
                <div className="p-5 max-w-sm w-full">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                    <div className="text-sm font-semibold text-stone-700">Kakao 지도 로드 실패</div>
                  </div>
                  <div className="text-xs text-stone-500 bg-white border border-stone-200 rounded-lg p-3 mb-3 break-keep">
                    <span className="font-mono text-stone-400">[{mapError.type}]</span> {mapError.msg}
                  </div>
                  <div className="text-xs text-stone-600 space-y-1.5">
                    <div><b>1.</b> JavaScript 키 확인 (REST API 키 아님)</div>
                    <div><b>2.</b> 카카오 콘솔 → 플랫폼 → Web → 도메인 등록</div>
                    <div><b>3.</b> <code className="bg-stone-100 px-1 rounded font-mono">python -m http.server 8000</code> 로컬 서버</div>
                  </div>
                </div>
              </div>
            )}
            <div ref={mapRef} style={{width:"100%",height:"100%"}} />

            {/* 빈 상태 오버레이 — 영업부/팀 필터 결과 0개 */}
            {mapStatus === "ready" && filteredStores.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl px-5 py-4 shadow-md text-center max-w-xs pointer-events-auto">
                  <div className="text-2xl mb-1.5 text-stone-400">🗺️</div>
                  <div className="text-sm font-semibold text-stone-700">
                    {teamFilter !== "전체"
                      ? `'${teamFilter}'에 표시할 매장이 없습니다`
                      : deptFilter !== "전체"
                        ? `'${deptFilter}'에 표시할 매장이 없습니다`
                        : bumFilter !== "전체"
                          ? `'${bumFilter}' 부문에 표시할 매장이 없습니다`
                          : "현재 필터 조건에 표시할 매장이 없습니다"}
                  </div>
                  <div className="text-xs text-stone-400 mt-1">상단 필터 또는 좌측 조직 트리에서 다른 항목을 선택해주세요</div>
                </div>
              </div>
            )}

            {/* 좌표 누락 안내 — 매장은 있으나 일부에 좌표가 없을 때 */}
            {mapStatus === "ready" && filteredStores.length > 0 && mappableStores.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 shadow-md text-center max-w-xs pointer-events-auto">
                  <div className="text-2xl mb-1.5">📍</div>
                  <div className="text-sm font-semibold text-amber-800">위치 정보가 등록된 매장이 없습니다</div>
                  <div className="text-xs text-amber-700 mt-1">매장 {filteredStores.length}개 중 좌표 미등록 매장만 존재합니다</div>
                </div>
              </div>
            )}

            {/* 라벨 모드 안내 — 줌 상태 기반 (매장 있을 때만) */}
            {mapStatus === "ready" && mappableStores.length > 0 && (
              <div className="absolute top-2 left-2 z-20 bg-white/90 backdrop-blur-sm border border-stone-200/80 rounded-md px-2 py-1 shadow-sm">
                <div className="text-[10px] text-stone-500 flex items-center gap-1.5">
                  {mapLevel <= HOVER_LEVEL_MAX && mappableStores.length <= 200 ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>
                      <span>마커에 마우스 올리면 매장명이 표시됩니다</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400 inline-block"/>
                      <span>지도를 확대하거나 필터를 좁히면 매장명이 표시됩니다</span>
                    </>
                  )}
                  {missingCoordCount > 0 && (
                    <span className="text-amber-600 ml-1">· 좌표 누락 {missingCoordCount}개 제외</span>
                  )}
                </div>
              </div>
            )}
            {/* 범례 — 소형·반투명 */}
            <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm border border-stone-200/80 rounded-lg px-2.5 py-2 z-20 shadow-sm">
              <div className="text-[10px] font-semibold text-stone-500 mb-1 uppercase tracking-wide">{yearLabel} 사고</div>
              {[
                {color:RISK_COLORS.high, label:"3건+", sz:13},
                {color:RISK_COLORS.mid,  label:"2건",  sz:10},
                {color:RISK_COLORS.low,  label:"1건",  sz:10},
                {color:RISK_COLORS.safe, label:"없음",  sz:7},
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 mb-0.5">
                  <div style={{width:l.sz,height:l.sz,borderRadius:"50%",background:l.color,border:"1px solid rgba(0,0,0,.1)",flexShrink:0}}/>
                  <span className="text-stone-500 text-[10px]">{l.label}</span>
                </div>
              ))}
            </div>
            {selectedStore && mapStatus === "ready" && !drawerOpen && (
              <div className="absolute top-2 right-2 z-20 bg-white/90 backdrop-blur-sm border border-stone-200/80 rounded-lg px-2.5 py-1.5 shadow-sm max-w-[200px]">
                <div className="font-semibold text-stone-800 text-xs truncate">{selectedStore.n}</div>
                <div className="text-stone-400 text-[10px] font-mono">{selectedStore.lat.toFixed(5)}, {selectedStore.lng.toFixed(5)}</div>
              </div>
            )}
          </div>

          {/* 로드뷰 패널 */}
          {rvOpen && selectedStore && (
            <div className="relative rounded-xl border border-stone-200 overflow-hidden bg-stone-100" style={{height:260}}>
              {/* 헤더 */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 bg-stone-700 border-b border-stone-600" style={{height:36}}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-stone-300 text-sm flex-shrink-0">🛣</span>
                  <span className="text-white text-xs font-medium truncate">{selectedStore.n}</span>
                  {rvStatus === "loading" && <span className="text-stone-400 text-[10px] flex-shrink-0">탐색 중...</span>}
                  {rvStatus === "ready" && (
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                      <span className="text-emerald-300 text-[10px]">연결됨</span>
                    </span>
                  )}
                  {rvStatus === "error" && <span className="text-amber-300 text-[10px] flex-shrink-0">위치 데이터 없음</span>}
                </div>
                <button onClick={() => { setRvOpen(false); setRvStatus("idle"); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-2 flex-shrink-0"
                  aria-label="로드뷰 닫기">✕</button>
              </div>
              {/* 로딩 상태 */}
              {rvStatus === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{top:36}}>
                  <div className="text-center">
                    <div className="text-2xl mb-2">🔍</div>
                    <div className="text-sm text-stone-600 font-medium">로드뷰를 불러오는 중입니다</div>
                    <div className="text-xs text-stone-400 mt-1">주변 50m 파노라마 탐색 중...</div>
                  </div>
                </div>
              )}
              {/* 오류/데이터 없음 */}
              {rvStatus === "error" && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{top:36}}>
                  <div className="text-center px-6">
                    <div className="text-3xl mb-2 text-stone-400">📷</div>
                    <div className="text-sm text-stone-500 font-medium">이 매장의 로드뷰를 표시할 수 없습니다</div>
                    <div className="text-xs text-stone-400 mt-1">해당 위치 50m 내 로드뷰 데이터가 없습니다</div>
                  </div>
                </div>
              )}
              <div ref={rvRef} style={{width:"100%",height:"100%",paddingTop:36}} />
            </div>
          )}
        </div>
      </div>

      {/* === 매장 상세 Drawer === */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[80] flex"
          role="dialog"
          aria-modal="true"
          aria-labelledby="store-drawer-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-stone-900/45 backdrop-blur-[2px] animate-[fadeIn_.2s_ease-out]"
            onClick={() => { setSelectedStore(null); setGuideText(""); setGuideError(null); setRvOpen(false); setRvStatus("idle"); }}
          />

          {/* Panel */}
          <div
            className="relative ml-auto h-full bg-white shadow-2xl flex flex-col animate-[slideIn_.3s_cubic-bezier(.2,.7,.3,1)]"
            style={{
              width: "min(560px, 100vw)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-stone-100"
              style={{background: getYearCount(selectedStore) >= 3 ? "linear-gradient(180deg,#FEF2F2 0%,#fff 100%)"
                : getYearCount(selectedStore) >= 1 ? "linear-gradient(180deg,#FFF7ED 0%,#fff 100%)"
                : "linear-gradient(180deg,#F8FAFC 0%,#fff 100%)"}}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {(() => {
                      const yearCnt = getYearCount(selectedStore) || 0;
                      const tot = selectedStore.tot || 0;
                      const badge = yearCnt >= 5 ? {l:"고위험", c: DAISO_RED, bg:"#FEE2E2"}
                        : yearCnt >= 2 ? {l:"주의", c:"#C2410C", bg:"#FED7AA"}
                        : yearCnt >= 1 ? {l:"관찰", c:"#A16207", bg:"#FEF3C7"}
                        : {l:"안전", c: SAFE_GREEN, bg:"#DCFCE7"};
                      return (
                        <>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{color: badge.c, background: badge.bg}}>
                            {badge.l}
                          </span>
                          {tot > 0 && (
                            <span className="text-[10px] font-semibold text-stone-500">사고 {tot}건 누적</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <h2 id="store-drawer-title" className="text-lg font-bold text-stone-900 leading-tight break-keep">{selectedStore.n}</h2>
                  <div className="text-xs text-stone-500 mt-1 break-keep">
                    {selectedStore.bm} · {selectedStore.dp} · {selectedStore.tm}
                  </div>
                </div>
                <button
                  ref={drawerCloseBtnRef}
                  onClick={() => { setSelectedStore(null); setGuideText(""); setGuideError(null); setRvOpen(false); setRvStatus("idle"); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-300 transition-colors flex-shrink-0"
                  aria-label="패널 닫기 (ESC)">
                  <span className="text-lg leading-none">✕</span>
                </button>
              </div>
            </div>

            {/* 스카이뷰 — 매장 위치 위성사진 */}
            {typeof selectedStore.lat === 'number' && (
              <div className="flex-shrink-0 border-b border-stone-100 relative" style={{height:'130px'}}>
                <div className="absolute inset-0 animate-pulse bg-stone-100" />
                <div ref={drawerSkyRef} className="absolute inset-0" />
              </div>
            )}

            {/* 요약 카드 그리드 */}
            <div className="flex-shrink-0 grid grid-cols-4 divide-x divide-stone-100 border-b border-stone-100">
              {(() => {
                const tot = selectedStore.tot || 0;
                // 최근 사고일
                const recent = ymd(storeAccidents[0]?.date, ".")
                  || (storeAccidents[0]?.year ? `${storeAccidents[0].year}` : "-");
                // 매장 인원수 (근로자DB store_workers)
                const storeWorkers = D.store_workers?.[selectedStore.n];
                const storeWorkersStr = storeWorkers != null ? `${storeWorkers}명` : "정보 없음";
                return [
                  {l:"전체 사고", v:`${tot}건`, c: tot>=3?"text-[#D70011]":tot>=1?"text-amber-700":"text-stone-700"},
                  {l:"최근 사고", v:recent, c:"text-stone-700", small:true},
                  {l:"매장 면적", v:selectedStore.ar ? `${selectedStore.ar}평` : "-", c:"text-stone-700"},
                  {l:"매장 인원", v:storeWorkersStr, c:"text-stone-700", small:true},
                ];
              })().map(k => (
                <div key={k.l} className="py-3 px-2 text-center">
                  <div className="text-[10px] text-stone-400 mb-1 uppercase tracking-wide">{k.l}</div>
                  <div className={`${k.small ? "text-sm" : "text-lg"} font-bold tabular-nums leading-tight ${k.c} truncate`}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* 탭 헤더 */}
            <div className="flex-shrink-0 border-b border-stone-200 px-3 flex items-center gap-0 overflow-x-auto" role="tablist">
              {[
                {id:"basic",     l:"기본"},
                {id:"hr",        l:"인원"},
                {id:"accident",  l:`사고${storeAccidents.length > 0 ? ` (${storeAccidents.length})` : ""}`},
                {id:"map",       l:"지도"},
                {id:"roadview",  l:"로드뷰"},
                {id:"ai",        l:"AI"},
              ].map(t => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={drawerTab === t.id}
                  onClick={() => setDrawerTab(t.id)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-3 min-h-[44px] border-b-2 transition-colors whitespace-nowrap focus:outline-none focus:bg-stone-50
                    ${drawerTab === t.id
                      ? "border-stone-800 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 — 패널 내부만 스크롤 */}
            <div className="flex-1 overflow-y-auto" role="tabpanel">

              {/* 1. 기본 정보 */}
              {drawerTab === "basic" && (
                <div className="p-5 space-y-3 text-sm">
                  {[
                    {l:"매장명", v:selectedStore.n},
                    {l:"부문", v:selectedStore.bm},
                    {l:"부서/영업부", v:selectedStore.dp},
                    {l:"팀", v:selectedStore.tm},
                    {l:"매장 형태", v:selectedStore.fm || "-"},
                    {l:"매장 인원", v: (() => {
                      const sw = D.store_workers?.[selectedStore.n];
                      if (sw == null) return "정보 없음";
                      const teamRow = (D.team_ir || []).find(t => t.team === selectedStore.tm);
                      const teamWorkers = teamRow?.workers;
                      return teamWorkers != null ? `${sw}명 (팀 전체 ${teamWorkers.toLocaleString()}명)` : `${sw}명`;
                    })()},
                    {l:"주요 재해유형", v:selectedStore.tp && selectedStore.tp !== "사고없음" ? selectedStore.tp : "사고 이력 없음"},
                  ].map(row => (
                    <div key={row.l} className="grid grid-cols-[110px_1fr] gap-3 items-start py-2 border-b border-stone-100 last:border-0">
                      <div className="text-xs text-stone-500 font-semibold pt-0.5">{row.l}</div>
                      <div className="text-stone-800 break-keep">{row.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. 인원·면적 */}
              {drawerTab === "hr" && (
                <div className="p-5 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {l:"매장 면적", v:selectedStore.ar ? `${selectedStore.ar}평` : "-", hint:"단위: 평"},
                      {l:"매장 형태", v:selectedStore.fm || "-", hint:"직영점/유통점/유통행사"},
                    ].map(c => (
                      <div key={c.l} className="rounded-lg border border-stone-200 p-3">
                        <div className="text-[10px] text-stone-400 uppercase tracking-wide">{c.l}</div>
                        <div className="text-base font-bold text-stone-800 mt-0.5">{c.v}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">{c.hint}</div>
                      </div>
                    ))}
                  </div>

                  {/* 매장 인원 정보 — 근로자DB 있을 때만 */}
                  {(() => {
                    const storeWorkers = D.store_workers?.[selectedStore.n];
                    const teamRow = (D.team_ir || []).find(t => t.team === selectedStore.tm);
                    if (storeWorkers == null && (!teamRow || teamRow.workers == null)) {
                      return (
                        <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 text-center">
                          <div className="text-2xl mb-1.5 text-stone-300">👥</div>
                          <div className="text-xs text-stone-500 font-medium">근로자DB가 업로드되지 않았습니다</div>
                          <div className="text-[10px] text-stone-400 mt-1">관리자 탭에서 매장근로자DB를 업로드하면 인원 정보가 표시됩니다</div>
                        </div>
                      );
                    }
                    const teamStores = MAP_STORES.filter(s => s.tm === selectedStore.tm);
                    const avgPerStore = (teamRow?.workers && teamStores.length > 0) ? (teamRow.workers / teamStores.length).toFixed(1) : "-";
                    return (
                      <div className="rounded-lg border border-stone-200 overflow-hidden">
                        <div className="bg-stone-50 px-3 py-2 text-[11px] font-bold text-stone-700 border-b border-stone-200">
                          인원 현황
                        </div>
                        <div className="divide-y divide-stone-100">
                          <div className="flex items-center justify-between px-3 py-2.5 bg-sky-50/40">
                            <span className="text-xs text-stone-600 font-semibold">이 매장 재직자</span>
                            <span className="text-base font-bold text-sky-700 tabular-nums">{storeWorkers != null ? `${storeWorkers}명` : "-"}</span>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-xs text-stone-500">팀 전체 재직자 ({selectedStore.tm})</span>
                            <span className="text-sm font-bold text-stone-800 tabular-nums">{teamRow?.workers != null ? `${teamRow.workers.toLocaleString()}명` : "-"}</span>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-xs text-stone-500">팀 매장 수</span>
                            <span className="text-sm font-bold text-stone-800 tabular-nums">{teamStores.length}개</span>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <span className="text-xs text-stone-500">팀 내 매장 평균 인원</span>
                            <span className="text-sm font-bold text-stone-800 tabular-nums">{avgPerStore}명</span>
                          </div>
                          {teamRow?.ir_per100 != null && (
                            <div className="flex items-center justify-between px-3 py-2.5 bg-rose-50/50">
                              <span className="text-xs text-stone-600 font-semibold">팀 100명당 IR</span>
                              <span className="text-sm font-bold text-rose-700 tabular-nums">{teamRow?.ir_per100.toFixed(2)}건</span>
                            </div>
                          )}
                        </div>
                        <div className="bg-stone-50/50 px-3 py-2 text-[10px] text-stone-400">
                          ※ 매장 단위 정확한 인원수는 근로자DB에서 사번 단위로 추적됩니다 (현재 화면은 팀 합계).
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 3. 사고 현황 */}
              {drawerTab === "accident" && (
                <div className="p-5 space-y-3">
                  {/* 연도별 KPI */}
                  <div className="grid grid-cols-4 divide-x divide-stone-200 rounded-lg border border-stone-200 overflow-hidden">
                    {[
                      {l:"전체",  v:selectedStore.tot, c: selectedStore.tot>=3?"text-[#D70011]":"text-stone-800"},
                      {l:"2024", v:selectedStore.y24, c:"text-stone-700"},
                      {l:"2025", v:selectedStore.y25, c:"text-stone-700"},
                      {l:"2026", v:selectedStore.y26, c:"text-stone-700"},
                    ].map(k => (
                      <div key={k.l} className="py-3 text-center">
                        <div className="text-[10px] text-stone-400 mb-1 uppercase tracking-wide">{k.l}</div>
                        <div className={`text-lg font-bold tabular-nums ${k.c}`}>
                          {k.v}<span className="text-xs font-normal text-stone-400 ml-0.5">건</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 사고 이력 */}
                  {storeAccidents.length > 0 ? (
                    <>
                      <div className="text-xs font-bold text-stone-700 flex items-center gap-1.5 mt-2">
                        <AlertTriangle size={12} className="text-amber-500" />
                        사고 이력 — 전체 {storeAccidents.length}건
                        {(() => {
                          const totalLoss = storeAccidents.reduce((s,a) => s+(a.lossDay||0), 0);
                          return totalLoss > 0 ? <span className="text-stone-400 font-normal">· 근로손실 {totalLoss}일</span> : null;
                        })()}
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {storeAccidents.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                            <div className="flex-shrink-0 mt-1">
                              <div className="w-2 h-2 rounded-full"
                                style={{background: (a.lossDay||0) >= 14 ? DAISO_RED : (a.lossDay||0) >= 4 ? "#F97316" : "#F59E0B"}} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-stone-800">{a.type || "유형미상"}</span>
                                {a.site && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">{a.site}</span>}
                                {a.lossDay > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{a.lossDay}일 손실</span>}
                                <span className="text-[10px] text-stone-400 ml-auto">
                                  {ymd(a.date) || `${a.year}년`}
                                </span>
                              </div>
                              {a.content && <div className="text-[11px] text-stone-600 mt-1 break-keep leading-relaxed">{a.content}</div>}
                              {a.dx && <div className="text-[10px] text-stone-400 mt-0.5">상병: {a.dx}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center">
                      <div className="text-3xl mb-2 text-emerald-400">✓</div>
                      <div className="text-sm font-semibold text-emerald-800">사고 이력 없음</div>
                      <div className="text-xs text-emerald-600 mt-1">이 매장의 사고 기록이 DB에 등록되어 있지 않습니다</div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. 지도 */}
              {drawerTab === "map" && (
                <div className="p-5">
                  {(typeof selectedStore.lat === "number" && typeof selectedStore.lng === "number") ? (
                    <>
                      <div ref={drawerMapRef} className="w-full rounded-lg border border-stone-200 overflow-hidden bg-stone-100" style={{height:320}} />
                      <div className="mt-3 text-xs text-stone-500 grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2">
                          <div className="text-[10px] text-stone-400 uppercase">위도</div>
                          <div className="font-mono text-stone-800 mt-0.5">{selectedStore.lat.toFixed(5)}</div>
                        </div>
                        <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2">
                          <div className="text-[10px] text-stone-400 uppercase">경도</div>
                          <div className="font-mono text-stone-800 mt-0.5">{selectedStore.lng.toFixed(5)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-8 text-center">
                      <div className="text-3xl mb-2 text-stone-300">📍</div>
                      <div className="text-sm font-semibold text-stone-600">위치 정보가 등록되어 있지 않습니다</div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. 로드뷰 */}
              {drawerTab === "roadview" && (
                <div className="p-5">
                  {(typeof selectedStore.lat !== "number" || typeof selectedStore.lng !== "number") ? (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-8 text-center">
                      <div className="text-3xl mb-2 text-stone-300">📷</div>
                      <div className="text-sm font-semibold text-stone-600">선택한 매장의 위치 정보가 부족합니다</div>
                    </div>
                  ) : (
                    <div className="relative rounded-lg border border-stone-200 overflow-hidden bg-stone-100" style={{height:340}}>
                      {drawerRvStatus === "loading" && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="text-center">
                            <div className="text-2xl mb-2">🔍</div>
                            <div className="text-sm text-stone-600 font-medium">로드뷰를 불러오는 중입니다</div>
                          </div>
                        </div>
                      )}
                      {drawerRvStatus === "error" && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="text-center px-6">
                            <div className="text-3xl mb-2 text-stone-400">📷</div>
                            <div className="text-sm text-stone-600 font-medium">이 매장의 로드뷰를 표시할 수 없습니다</div>
                            <div className="text-xs text-stone-400 mt-1">해당 위치 50m 내 데이터가 없습니다</div>
                          </div>
                        </div>
                      )}
                      <div ref={drawerRvRef} style={{width:"100%",height:"100%"}} />
                    </div>
                  )}
                </div>
              )}

              {/* 6. AI 분석 */}
              {drawerTab === "ai" && (
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => fetchGuide(selectedStore)}
                      disabled={guideLoading}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
                      style={{background: guideLoading ? "#9CA3AF" : "linear-gradient(135deg,#071E4A,#1D4ED8)"}}>
                      <span className="text-sm leading-none">{guideLoading ? "⏳" : "✨"}</span>
                      {guideLoading ? "AI 분석 중..." : guideText ? "가이드 재생성" : "AI 안전가이드 생성"}
                    </button>
                    {guideLoading && (
                      <button onClick={() => abortRef.current?.abort()}
                        className="text-xs text-stone-400 hover:text-stone-600 underline cursor-pointer h-8 px-1">중단</button>
                    )}
                    {storeAccidents.length === 0 && !guideLoading && !guideText && (
                      <span className="text-[10px] text-stone-400 flex items-center gap-1">
                        <span>ⓘ</span> 사고 이력 없음 — 일반 가이드로 생성됩니다
                      </span>
                    )}
                  </div>

                  {!guideText && !guideError && !guideLoading && (
                    <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-6 text-center">
                      <div className="text-3xl mb-2">✨</div>
                      <div className="text-sm font-semibold text-stone-700">AI 안전가이드</div>
                      <div className="text-xs text-stone-500 mt-1 leading-relaxed break-keep">
                        이 매장의 실제 사고 데이터를 분석하여<br />현장 관리자가 즉시 실행 가능한 예방 가이드를 생성합니다
                      </div>
                    </div>
                  )}

                  {guideError && (
                    <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 break-keep">
                      <span className="flex-shrink-0 mt-0.5 text-amber-500">⚠</span>
                      <div className="min-w-0">
                        <div className="font-semibold mb-0.5">AI 가이드 생성 실패</div>
                        <div className="text-amber-700 break-all leading-relaxed">{guideError}</div>
                      </div>
                    </div>
                  )}

                  {guideText && (
                    <div className="text-xs text-stone-700 leading-relaxed break-keep whitespace-pre-wrap rounded-lg border border-stone-200 p-3">
                      {guideText.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) return <div key={i} className="font-bold text-stone-900 text-sm mt-3 mb-1 border-b border-stone-100 pb-0.5">{line.slice(3)}</div>;
                        if (line.startsWith("### ")) return <div key={i} className="font-bold text-stone-800 mt-2 mb-0.5">{line.slice(4)}</div>;
                        if (line.startsWith("**") && line.endsWith("**")) return <div key={i} className="font-bold text-stone-800 mt-1.5">{line.slice(2,-2)}</div>;
                        const parts = line.split(/\*\*(.+?)\*\*/g);
                        return (
                          <div key={i} className={line.startsWith("- ") || line.startsWith("• ") ? "ml-2 my-0.5" : "my-0.5"}>
                            {parts.map((p, j) => j % 2 === 1 ? <b key={j} className="text-stone-900">{p}</b> : p)}
                          </div>
                        );
                      })}
                      {guideLoading && <span className="inline-block w-1.5 h-3.5 bg-[#1D4ED8] animate-pulse ml-0.5 rounded-sm" />}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* 푸터 — 빠른 액션 */}
            <div className="flex-shrink-0 border-t border-stone-100 px-4 py-2.5 bg-stone-50 flex items-center justify-between gap-2">
              <div className="text-[10px] text-stone-400">
                ESC · 배경 클릭으로 닫기
              </div>
              <button
                onClick={() => { setSelectedStore(null); setGuideText(""); setGuideError(null); setRvOpen(false); setRvStatus("idle"); }}
                className="text-xs font-semibold text-stone-600 hover:text-stone-800 px-3 h-7 rounded border border-stone-200 hover:bg-white transition-colors">
                닫기
              </button>
            </div>
          </div>

          {/* drawer slide-in + backdrop fade-in keyframes */}
          <style>{`
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
        </div>
      )}
    </div>
  );
}

// 추정 표기 배지 (비주얼 컴포넌트)
export default StoreRiskMap;
