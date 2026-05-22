import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN } from '../../constants/colors.js';
import { SCHEMA_ACCIDENT, SCHEMA_STORE, SCHEMA_WORKER, SCHEMA_CUSTOMER } from '../../constants/schemas.js';
import { validateSchema, downloadTemplate } from '../../utils/validation.js';

function UploadPanel({ onAccidentFile, onStoreFile, onWorkerFile, accidentFileName, storeFileName, workerFileName, loading, resetData, isDefault }) {
  const accRef = useRef(null);
  const storeRef = useRef(null);
  const workerRef = useRef(null);
  const [validation, setValidation] = useState({});  // {acc: {...}, store: {...}, worker: {...}}
  
  // 파일 검증 + 처리 래퍼
  const handleFile = async (file, schema, kind, originalHandler) => {
    if (!file) return;
    try {
      // 미리 파싱해서 검증
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
          const sheetName = wb.SheetNames.includes(schema.sheet) ? schema.sheet : wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
          const result = validateSchema(rows, schema);
          setValidation(prev => ({ ...prev, [kind]: result }));
          if (result.ok) {
            // 검증 통과 시 실제 업로드 처리
            originalHandler(file);
          }
        } catch (err) {
          setValidation(prev => ({ ...prev, [kind]: { ok: false, errors: [`파일 읽기 실패: ${err.message}`], warnings: [], stats: null }}));
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setValidation(prev => ({ ...prev, [kind]: { ok: false, errors: [err.message], warnings: [], stats: null }}));
    }
  };
  
  const ValidationBadge = ({ result }) => {
    if (!result) return null;
    if (result.ok && result.warnings.length === 0) {
      return <div className="mt-2 text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> 검증 통과 · {result.stats?.totalRows}행</div>;
    }
    return (
      <div className="mt-2 space-y-1">
        {result.errors.map((e, i) => (
          <div key={"e"+i} className="text-[10px] text-red-600 flex items-start gap-1 break-keep">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> <span>{e}</span>
          </div>
        ))}
        {result.warnings.map((w, i) => (
          <div key={"w"+i} className="text-[10px] text-amber-600 flex items-start gap-1 break-keep">
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> <span>{w}</span>
          </div>
        ))}
        {result.ok && <div className="text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> 통과 · {result.stats?.totalRows}행</div>}
      </div>
    );
  };
  
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-stone-800">Excel 파일 업로드 (자동 분석)</div>
          <div className="text-xs text-stone-500 mt-0.5">양식 다운로드 → 데이터 입력 → 업로드 시 자동 검증</div>
        </div>
        {!isDefault && <button onClick={resetData} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 bg-white hover:bg-stone-50 font-semibold cursor-pointer"><RefreshCw size={13} className="inline -mt-0.5 mr-1" /> 기본 데이터로</button>}
      </div>
      
      {/* 양식 다운로드 줄 */}
      <div className="mb-3 flex flex-wrap gap-2 items-center text-[11px] bg-blue-50 border border-blue-200 rounded-lg p-2">
        <Download size={12} className="text-blue-700 flex-shrink-0" />
        <span className="text-blue-700 font-semibold">양식 다운로드:</span>
        <button onClick={() => downloadTemplate(SCHEMA_ACCIDENT)} className="px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-medium cursor-pointer">근로자사고DB</button>
        <button onClick={() => downloadTemplate(SCHEMA_STORE)} className="px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-medium cursor-pointer">매장현황DB</button>
        <button onClick={() => downloadTemplate(SCHEMA_WORKER)} className="px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-medium cursor-pointer">현장사원DB</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ① 사고DB */}
        <div className={`border-2 border-dashed rounded-lg p-3 bg-white transition ${accidentFileName ? "border-green-500 bg-green-50" : validation.acc?.errors?.length > 0 ? "border-red-400 bg-red-50" : "border-stone-300"}`}>
          <input ref={accRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files[0] && handleFile(e.target.files[0], SCHEMA_ACCIDENT, "acc", onAccidentFile)} />
          <div onClick={() => accRef.current?.click()} className="cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{accidentFileName ? <CheckCircle2 size={24} className="text-emerald-600" /> : <BarChart3 size={24} className="text-stone-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-900">① 근로자사고DB</div>
                <div className="text-xs text-stone-600 truncate">{accidentFileName || "사고DB 엑셀 파일 선택..."}</div>
              </div>
            </div>
          </div>
          <ValidationBadge result={validation.acc} />
        </div>
        
        {/* ② 매장DB */}
        <div className={`border-2 border-dashed rounded-lg p-3 bg-white transition ${storeFileName ? "border-green-500 bg-green-50" : validation.store?.errors?.length > 0 ? "border-red-400 bg-red-50" : "border-stone-300"}`}>
          <input ref={storeRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files[0] && handleFile(e.target.files[0], SCHEMA_STORE, "store", onStoreFile)} />
          <div onClick={() => storeRef.current?.click()} className="cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{storeFileName ? <CheckCircle2 size={24} className="text-emerald-600" /> : <Store size={24} className="text-stone-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-900">② 매장현황DB</div>
                <div className="text-xs text-stone-600 truncate">{storeFileName || "매장리스트 엑셀 파일 선택..."}</div>
              </div>
            </div>
          </div>
          <ValidationBadge result={validation.store} />
        </div>
        
        {/* ③ 근로자DB */}
        <div className={`border-2 border-dashed rounded-lg p-3 bg-white transition ${workerFileName ? "border-green-500 bg-green-50" : validation.worker?.errors?.length > 0 ? "border-red-400 bg-red-50" : "border-stone-300"}`}>
          <input ref={workerRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files[0] && onWorkerFile && handleFile(e.target.files[0], SCHEMA_WORKER, "worker", onWorkerFile)} />
          <div onClick={() => workerRef.current?.click()} className="cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{workerFileName ? <CheckCircle2 size={24} className="text-emerald-600" /> : <Users size={24} className="text-stone-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-900">③ 매장근로자DB</div>
                <div className="text-xs text-stone-600 truncate">{workerFileName || "현장사원 인원현황 파일..."}</div>
              </div>
            </div>
          </div>
          <ValidationBadge result={validation.worker} />
        </div>
      </div>
      {loading && <div className="mt-3 text-xs text-blue-700 flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"/>파일 처리 중...</div>}
      {isDefault && <div className="mt-3 text-xs text-stone-500">현재 내장된 샘플 데이터(2026-04-23 기준)를 표시 중입니다</div>}
    </div>
  );
}



// ========== Excel Upload & Parsing Logic (browser-side) ==========

export default UploadPanel;
