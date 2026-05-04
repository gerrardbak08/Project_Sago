import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, X } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, ALERT_RED, SAFE_GREEN } from '../../constants/colors.js';
import { SCHEMA_CUSTOMER } from '../../constants/schemas.js';
import { validateSchema, downloadTemplate } from '../../utils/validation.js';

function CustomerAdminPanel({ onLogout }) {
  const [tab, setTab] = useState("upload");
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);
  const D = CUSTOMER_DATA;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus({ type:"info", msg:`"${file.name}" 검증 중...` });
    
    // 양식 검증
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", cellDates: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
        const result = validateSchema(rows, SCHEMA_CUSTOMER);
        
        if (!result.ok) {
          const errMsg = `⚠️ 검증 실패\n${result.errors.join("\n")}`;
          setUploadStatus({ type: "warn", msg: errMsg + (result.warnings.length ? "\n\n경고: " + result.warnings.join("; ") : "") });
        } else if (result.warnings.length > 0) {
          setUploadStatus({ type: "warn", msg: `✅ 검증 통과 (${result.stats.totalRows}행)\n경고: ${result.warnings.join("; ")}\n\n⚠️ 실제 적용은 백엔드 연동 후 활성화 예정.` });
        } else {
          setUploadStatus({ type: "success", msg: `✅ 검증 통과 — ${result.stats.totalRows}행, 모든 필수 컬럼 일치\n\n⚠️ 실제 적용은 백엔드 연동 후 활성화 예정.` });
        }
      } catch (err) {
        setUploadStatus({ type: "warn", msg: `⚠️ 파일 읽기 실패: ${err.message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportAllData = () => {
    const blob = new Blob([JSON.stringify(D, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `고객사고_전체데이터_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 관리자 모드 안내 배너 */}
      <div className="rounded-lg p-4 text-white" style={{background:"linear-gradient(135deg,#0EA5E9,#0284C7)"}}>
        <div className="flex items-center gap-2">
          <Lock size={16}/>
          <div className="font-bold">관리자 모드 — 고객사고 데이터 관리</div>
        </div>
        <div className="text-xs opacity-90 mt-1">데이터 업로드 · 통계 점검 · 내보내기 기능 · 로그아웃 시 일반 사용자 모드로 전환</div>
      </div>

      {/* 서브 탭 */}
      <div className="flex gap-1 border-b border-stone-200">
        {[
          {id:"upload", l:"데이터 업로드", Icon: Folder},
          {id:"stats", l:"데이터 통계", Icon: BarChart3},
          {id:"export", l:"내보내기", Icon: Download},
          {id:"audit", l:"감사 로그", Icon: ClipboardList},
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${tab===t.id ? "border-sky-500 text-sky-600" : "border-transparent text-stone-500 hover:text-stone-700"}`}>
            <t.Icon size={12} className="inline -mt-0.5 mr-1"/>{t.l}
          </button>
        ))}
      </div>

      {/* 데이터 업로드 */}
      {tab === "upload" && (
        <div className="space-y-3">
          <Card title="고객사고DB 업로드" titleIcon={Folder} sub="xlsx 파일을 업로드하면 대시보드 데이터가 자동 갱신됩니다">
            <div className="space-y-3">
              {/* 양식 다운로드 */}
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                <Download size={12} className="text-blue-700 flex-shrink-0"/>
                <span className="text-blue-700 font-semibold">양식 다운로드:</span>
                <button onClick={() => downloadTemplate(SCHEMA_CUSTOMER)} className="px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-medium cursor-pointer">
                  고객사고DB 양식
                </button>
                <span className="text-blue-600 ml-auto">필수 {SCHEMA_CUSTOMER.required.length}개 + 선택 {SCHEMA_CUSTOMER.optional.length}개 컬럼</span>
              </div>
              
              <div className="border-2 border-dashed border-stone-300 rounded-lg p-8 text-center bg-stone-50">
                <Folder size={32} className="mx-auto text-stone-400 mb-2"/>
                <div className="text-sm font-medium text-stone-700 mb-1">고객사고DB.xlsx 파일 선택</div>
                <div className="text-xs text-stone-500 mb-3">업로드 시 자동 검증 — 필수 {SCHEMA_CUSTOMER.required.length}개 컬럼 확인</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden"/>
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-md bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600">
                  파일 선택
                </button>
              </div>
              {uploadStatus && (
                <div className={`p-3 rounded-lg text-xs whitespace-pre-line ${
                  uploadStatus.type === "info" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                  uploadStatus.type === "warn" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                  "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}>{uploadStatus.msg}</div>
              )}
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-600">
                <div className="font-semibold text-stone-700 mb-1.5">📋 데이터 갱신 절차</div>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>매월 마감 후 고객사고DB.xlsx 다운로드 (CS 시스템)</li>
                  <li>본 페이지에서 파일 업로드 → 자동 검증 → 반영</li>
                  <li>오류 발견 시 행 단위 알림 → 수정 후 재업로드</li>
                  <li>정상 반영 시 모든 탭이 새 데이터로 갱신</li>
                </ol>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 데이터 통계 */}
      {tab === "stats" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="원본 데이터 현황" titleIcon={BarChart3} sub="DB 적재 현황">
            <div className="space-y-2 text-sm">
              {[
                {l:"총 사고건수", v:`${D.kpis_all.total.toLocaleString()}건`},
                {l:"2024년", v:`${D.kpis_y24.total}건 (${(D.kpis_y24.total/D.kpis_all.total*100).toFixed(1)}%)`},
                {l:"2025년", v:`${D.kpis_y25.total}건 (${(D.kpis_y25.total/D.kpis_all.total*100).toFixed(1)}%)`},
                {l:"2026년", v:`${D.kpis_y26.total}건 (진행중)`},
                {l:"보상 발생 건", v:`${D.kpis_all.comp_count}건 (전체의 ${(D.kpis_all.comp_count/D.kpis_all.total*100).toFixed(1)}%)`},
                {l:"미종결 건", v:`${D.kpis_all.still_open}건`},
              ].map(item => (
                <div key={item.l} className="flex justify-between border-b border-stone-100 pb-1.5">
                  <span className="text-stone-500">{item.l}</span>
                  <span className="font-semibold text-stone-800 tabular-nums">{item.v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="데이터 품질" titleIcon={ShieldCheck} sub="이상값 · 누락 데이터 점검">
            <div className="space-y-2 text-sm">
              {[
                {l:"성별 미상", v:"16건", status:"warn"},
                {l:"연령대 미상", v:"95건", status:"warn"},
                {l:"발생시간 누락", v:"42건", status:"warn"},
                {l:"보상금액 누락(보상 진행)", v:"0건", status:"ok"},
                {l:"중복 사고 가능성", v:"0건", status:"ok"},
                {l:"부문명 비표준", v:"19건", status:"warn"},
              ].map(item => (
                <div key={item.l} className="flex justify-between border-b border-stone-100 pb-1.5">
                  <span className="text-stone-500">{item.l}</span>
                  <span className={`font-semibold tabular-nums ${item.status==="warn" ? "text-amber-600" : "text-emerald-600"}`}>
                    {item.status==="warn" ? "⚠ " : "✓ "}{item.v}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
              ※ 부문명 비표준 19건: "관악/수원/용인영업부" vs "관악/평택/안산영업부" 혼재 — 표준화 권장
            </div>
          </Card>
        </div>
      )}

      {/* 내보내기 */}
      {tab === "export" && (
        <Card title="데이터 내보내기" titleIcon={Download} sub="외부 시스템 연동 또는 백업용">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <button onClick={exportAllData}
              className="text-left p-4 rounded-lg border border-stone-200 hover:border-sky-400 hover:bg-sky-50 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Download size={16} className="text-sky-600"/>
                <span className="font-semibold text-stone-800">전체 데이터 (JSON)</span>
              </div>
              <div className="text-xs text-stone-500">사전 집계된 모든 차원 데이터를 JSON으로 다운로드</div>
            </button>
            {[
              {l:"사고유형별 (CSV)", desc:"6개 유형별 연도/보상 통계", rows: D.types},
              {l:"영업부별 (CSV)", desc:"영업부별 건수/보상/처리 통계", rows: D.depts},
              {l:"매장 워치리스트 (CSV)", desc:"다발 매장 Top 50", rows: D.store_watchlist},
            ].map(item => (
              <button key={item.l} onClick={() => exportCSV(item.rows, item.l.split(" ")[0]+".csv")}
                className="text-left p-4 rounded-lg border border-stone-200 hover:border-stone-400 hover:bg-stone-50">
                <div className="flex items-center gap-2 mb-1">
                  <Download size={16} className="text-stone-600"/>
                  <span className="font-semibold text-stone-800">{item.l}</span>
                </div>
                <div className="text-xs text-stone-500">{item.desc}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 감사 로그 */}
      {tab === "audit" && (
        <Card title="감사 로그" titleIcon={ClipboardList} sub="데이터 접근 · 수정 이력 (예시)">
          <div className="text-xs text-stone-500 mb-3">
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 mr-2">개발 진행중</span>
            실제 운영 시 모든 관리자 활동이 자동 기록됩니다 (로그인 시각, IP, 파일 업로드, 데이터 수정 등)
          </div>
          <div className="space-y-1 text-xs font-mono bg-stone-900 text-stone-100 p-3 rounded-lg">
            <div className="text-stone-400">[2026-04-28 14:32:11] admin login from 10.0.1.45 (Park, 안전보건팀)</div>
            <div className="text-stone-400">[2026-04-28 14:32:18] tab=stats viewed</div>
            <div className="text-stone-400">[2026-04-28 14:35:42] export=고객사고_전체데이터.json downloaded</div>
            <div className="text-stone-400">[2026-04-27 09:12:33] admin login from 10.0.1.45 (Park, 안전보건팀)</div>
            <div className="text-stone-400">[2026-04-27 09:18:55] data_upload 고객사고DB_2026Q1.xlsx (1,512 rows) ✓</div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default CustomerAdminPanel;
