import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Eye, Send, ScanSearch } from 'lucide-react';

import { DAISO_RED } from './colors.js';

const TABS_VIEWER = [
  { id: "overview", l: "요약", short: "요약", Icon: LayoutDashboard, hub: 1 },
  { id: "dept", l: "부서·팀", short: "부서", Icon: Building2, hub: 2 },
  { id: "store", l: "매장 IR", short: "매장", Icon: Store, hub: 2 },
  { id: "parjang", l: "파트장", short: "파트장", Icon: ShieldCheck, hub: 2 },
  { id: "riskmap", l: "매장위험지도", short: "위험지도", Icon: MapPin, hub: 3 },
  { id: "time", l: "시계열", short: "시계열", Icon: TrendingUp, hub: 4 },
  { id: "cross", l: "요인×결과", short: "요인", Icon: GitBranch, hub: 4 },
  { id: "human", l: "인적요인", short: "인적", Icon: Users, hub: 4 },
  { id: "repeat", l: "재발재해자", short: "재발", Icon: Siren, hub: 5 },
  { id: "repeatstore", l: "반복사고 매장", short: "반복매장", Icon: Store, hub: 5 },
  { id: "severity", l: "의료 심각도", short: "심각도", Icon: Stethoscope, hub: 5 },
  { id: "severestore", l: "중상해 매장", short: "중상해", Icon: AlertTriangle, hub: 5 },
  { id: "legal", l: "법적 보고", short: "법적", Icon: Scale, hub: 5 },
  { id: "cost", l: "비용 손실", short: "비용", Icon: Banknote, hub: 5 },
];

const HUB_LABELS = {
  1: { name: "요약", color: "#1C1917" },
  2: { name: "조직", color: "#1D4ED8" },
  3: { name: "지역", color: "#0891B2" },
  4: { name: "추세·분석", color: "#B45309" },
  5: { name: "리스크 관리", color: DAISO_RED },
};

// ── 관리자 전용 알림 탭 ──
const ALERT_TABS = [
  { id: "alert_monitor",  l: "알림 현황",   short: "알림현황",  Icon: Bell },
  { id: "alert_send",     l: "알림 발송",   short: "알림발송",  Icon: Send },
  { id: "alert_review",   l: "AI 검토",    short: "AI검토",   Icon: ScanSearch },
];

// ── 고객사고 탭 정의 ──
const CTABS = [
  { id: "cov",   l: "요약",     short: "요약",   Icon: LayoutDashboard },
  { id: "cdept", l: "부서별",   short: "부서",   Icon: Building2 },
  { id: "ctype", l: "유형·장소", short: "유형",   Icon: Tag },
  { id: "ccomp", l: "보상",     short: "보상",   Icon: Banknote },
  { id: "cwatch",l: "모니터링", short: "모니터", Icon: Eye },
  { id: "cvic",  l: "피해자",   short: "피해자", Icon: Users },
];

// ── 7개 그룹 통폐합 네비 (13개 탭 id 보존, 논리 그룹으로 묶음) ──
const TAB_GROUPS = [
  { id: 'g_summary', l: '요약',        short: '요약', Icon: LayoutDashboard, subs: ['overview'] },
  { id: 'g_org',     l: '조직',        short: '조직', Icon: Building2,       subs: ['dept', 'parjang'] },
  { id: 'g_store',   l: '매장',        short: '매장', Icon: Store,           subs: ['store', 'riskmap'] },
  { id: 'g_trend',   l: '추세·요인',   short: '추세', Icon: TrendingUp,      subs: ['time', 'cross'] },
  { id: 'g_human',   l: '인적·심각도', short: '인적', Icon: Stethoscope,     subs: ['human', 'severity', 'severestore'] },
  { id: 'g_risk',    l: '재발·손실',   short: '손실', Icon: Siren,           subs: ['repeat', 'repeatstore', 'cost'] },
  { id: 'g_legal',   l: '법적·산재',   short: '법적', Icon: Scale,           subs: ['legal'] },
];

export { TABS_VIEWER, HUB_LABELS, CTABS, ALERT_TABS, TAB_GROUPS };
