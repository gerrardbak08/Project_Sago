import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle2, AlertCircle, Download, X } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN } from '../../constants/colors.js';
import UploadPanel from '../shared/UploadPanel.jsx';
import { SCHEMA_ACCIDENT, SCHEMA_STORE, SCHEMA_WORKER } from '../../constants/schemas.js';
import { downloadTemplate, validateSchema } from '../../utils/validation.js';

function AdminUpload({ onAccidentFile, onStoreFile, onWorkerFile, accidentFileName, storeFileName, workerFileName, loading, resetData, isDefault, onLogout, workerJoin, workerKpis, workerIrSummary }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="bg-stone-900 text-white rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs opacity-80 font-medium flex items-center gap-1"><Lock size={12} strokeWidth={2} /> 관리자 모드</div>
            <div className="text-lg font-extrabold">데이터 관리 · 업로드</div>
            <div className="text-xs opacity-80 mt-1">이 페이지는 관리자만 접근 가능합니다 · 로그아웃 시 일반 사용자 모드로 전환</div>
          </div>
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-semibold cursor-pointer"><Unlock size={13} className="inline -mt-0.5 mr-1" /> 로그아웃</button>
        </div>
      </div>
      
      <UploadPanel 
        onAccidentFile={onAccidentFile}
        onStoreFile={onStoreFile}
        onWorkerFile={onWorkerFile}
        accidentFileName={accidentFileName}
        storeFileName={storeFileName}
        workerFileName={workerFileName}
        loading={loading}
        resetData={resetData}
        isDefault={isDefault}
      />

      {/* Phase 2 진단 카드 — 근로자DB 로드 결과 */}
      {workerKpis && (
        <Card title="근로자DB 진단 (Phase 2~3)" titleIcon={Users} sub="업로드된 근로자DB의 처리 결과 · 사고DB와의 매칭 상태 · 100명당 IR">
          {/* 헤드라인: 100명당 IR */}
          {workerIrSummary && workerIrSummary.total && (
            <div className="mb-3 p-4 rounded-lg bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200">
              <div className="flex items-baseline justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide" style={{color: ALERT_RED}}>영업부문 100명당 IR</div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-4xl font-extrabold tabular-nums" style={{color:"#1C1917"}}>{workerIrSummary.total.ir_per100 != null ? workerIrSummary.total.ir_per100.toFixed(2) : "—"}</span>
                    <span className="text-sm text-stone-500 font-medium">건/100명</span>
                  </div>
                  <div className="text-xs text-stone-600 mt-1">
                    분자: 영업부문 사고 {workerIrSummary.total.incidents.toLocaleString()}건 (전체 기간 누적) · 분모: 재직자 {workerIrSummary.total.workers.toLocaleString()}명 (스냅샷)
                  </div>
                </div>
                <div className="flex gap-2">
                  {workerIrSummary.by_bumun.map(b => (
                    <div key={b.bum} className="px-3 py-2 rounded-md bg-white border border-stone-200">
                      <div className="text-[10px] text-stone-500 font-semibold">{b.bum}</div>
                      <div className="text-lg font-bold tabular-nums" style={{color: b.bum==="수도권"?"#2563EB":"#EA580C"}}>{b.ir_per100 != null ? b.ir_per100.toFixed(2) : "—"}</div>
                      <div className="text-[10px] text-stone-500">{b.workers.toLocaleString()}명 · {b.incidents}건</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-xs text-emerald-700 font-semibold mb-0.5">영업부문 재직</div>
              <div className="text-2xl font-extrabold text-emerald-900">{workerKpis.total_sales_active.toLocaleString()}<span className="text-sm font-bold ml-1">명</span></div>
              <div className="text-xs text-emerald-700 mt-0.5">매장 {workerKpis.total_stores_with_workers}개</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-xs text-amber-800 font-semibold mb-0.5">매장 규모 분포 (참고)</div>
              <div className="text-sm font-bold text-amber-900 mt-0.5 leading-tight">
                5인+ <span className="tabular-nums">{workerKpis.cpa_stores}</span>매장 ({workerKpis.cpa_workers.toLocaleString()}명)
              </div>
              <div className="text-xs text-amber-800 mt-0.5">5인 미만 {workerKpis.non_cpa_stores}매장 · {workerKpis.non_cpa_workers}명 (IR 산출 시 ⚠️ unstable)</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-xs text-blue-700 font-semibold mb-0.5">신규입사 (1년 미만)</div>
              <div className="text-2xl font-extrabold text-blue-900">{workerKpis.new_hires_1y.toLocaleString()}<span className="text-sm font-bold ml-1">명</span></div>
              <div className="text-xs text-blue-700 mt-0.5">{workerKpis.new_hires_1y_pct}% · 6개월 미만 {workerKpis.new_hires_6m.toLocaleString()}명</div>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-700">
            <div className="font-semibold text-stone-800 mb-1">분류 결과</div>
            <div>전체 행: {workerKpis.total_rows.toLocaleString()} · 재직 {workerKpis.total_active.toLocaleString()} · 영업부문 재직 {workerKpis.total_sales_active.toLocaleString()} (분석 대상) · 점장 {workerKpis.manager_count.toLocaleString()} · 기준일 {workerKpis.ref_date}</div>
            <div className="mt-1 text-stone-500">※ 영업부문(수도권/지방)만 분석 대상. 본부·매장지원 등 그 외 조직은 분석 제외.</div>
          </div>
          {workerJoin && (
            <div className="mt-3 p-3 rounded-lg bg-white border border-stone-200">
              <div className="text-xs font-semibold text-stone-800 mb-1">사고DB ↔ 근로자DB 매장 조인 결과</div>
              <div className="text-xs text-stone-700">
                근로자DB 매장 <b>{workerJoin.worker_db_stores}</b>개 중
                <span className="text-emerald-700 font-semibold"> 매칭 {workerJoin.matched_count}</span> /
                <span className="text-rose-700 font-semibold"> 미매칭 {workerJoin.unmatched_count}</span>
                <span className="text-stone-500"> (매칭 기준: {workerJoin.master_source})</span>
              </div>
              {workerJoin.unmatched_sample && workerJoin.unmatched_sample.length > 0 && (
                <div className="mt-2 text-xs text-stone-600">
                  <span className="font-semibold text-stone-700">미매칭 샘플:</span> {workerJoin.unmatched_sample.join(", ")}
                  {workerJoin.unmatched_count > workerJoin.unmatched_sample.length && <span className="text-stone-500"> 외 {workerJoin.unmatched_count - workerJoin.unmatched_sample.length}건</span>}
                </div>
              )}
              {workerJoin.fuzzy_matched_count > 0 && (
                <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5">
                  <span className="font-semibold">✓ 퍼지 매칭 {workerJoin.fuzzy_matched_count}건 자동 연결:</span>
                  <span className="text-emerald-600 ml-1">{workerJoin.fuzzy_matched_sample?.join(" · ")}</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <div className="font-semibold mb-1 flex items-center gap-1"><Lock size={12} /> PII 처리 정책</div>
            <div>사번·성명은 브라우저 메모리 내에서만 처리되며 어떤 외부 서버로도 전송되지 않습니다. 다운로드·내보내기 시 사번은 SHA형 해시(EMP_xxxxxxxx), 성명은 마스킹(예: 김**)으로 변환됩니다.</div>
          </div>
        </Card>
      )}
      
      <Card title="파일 업로드 가이드" titleIcon={ClipboardList}>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <div className="text-sm font-bold text-blue-900 mb-1">① 근로자사고DB (필수)</div>
            <div className="text-xs text-stone-700">파일명 예: <code className="bg-white px-1.5 py-0.5 rounded font-mono">근로자사고DB_260423.xlsx</code></div>
            <div className="text-xs text-stone-600 mt-1">필수 컬럼: 년, 월, 부서, 팀명, 매장명, 재해자명, 사번, 나이대, 근속기간, 재해 종류, 재해 유형, 기인물, 상병명, 사고 내용, 파트장 등 32개</div>
          </div>
          <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep">
            <div className="text-sm font-bold text-violet-900 mb-1">② 매장현황DB (선택)</div>
            <div className="text-xs text-stone-700">파일명 예: <code className="bg-white px-1.5 py-0.5 rounded font-mono">매장리스트_260408.xlsx</code></div>
            <div className="text-xs text-stone-600 mt-1">필수 컬럼: 매장, 매장명, 지역(팀명), 형태, 폐점여부, 구분, 오픈일, 평수, 창고, 진열평수, 신주소</div>
          </div>
          <div className="p-3 rounded-lg bg-white border border-stone-200 border-l-2 border-l-emerald-600 break-keep">
            <div className="text-sm font-bold text-emerald-900 mb-1">③ 매장근로자DB (선택, 신규)</div>
            <div className="text-xs text-stone-700">파일명 예: <code className="bg-white px-1.5 py-0.5 rounded font-mono">현장사원_인원현황_조회_YYYYMMDD.xlsx</code></div>
            <div className="text-xs text-stone-600 mt-1">필수 컬럼 (시트 '영업부'): 부문, 부서, 팀, 조직명, 사번, 성명, 사원상태, 입사일자(YYYYMMDD), 퇴직일자, 사원유형, 채용구분, 입사경로, 직책</div>
            <div className="text-xs text-stone-500 mt-1">분모 시점: 업로드일 기준 재직자 스냅샷 · 영업부문(수도권/지방)만 매장 단위 집계, 본부 인력은 별도 집계</div>
          </div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <div className="text-sm font-bold text-green-900 mb-1">업로드 후 자동 처리</div>
            <div className="text-xs text-stone-700">1. 브라우저에서 Excel 파싱 (서버 전송 없음)<br/>2. 데이터 정제 및 변환 (부문 자동 분류, 근속 구간화, 요일 추출, PII 해시·마스킹)<br/>3. 50+ 개 지표 자동 재계산 (per-100 IR 포함)<br/>4. 전체 탭 자동 갱신</div>
          </div>
        </div>
      </Card>
      
      <Card title="권한 관리 (향후 확장)" titleIcon={Lock}>
        <div className="text-sm text-stone-700 space-y-2">
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <b>현재 방식</b>: 클라이언트 PIN 검증 (데모용). 브라우저 내에서 PIN 검증
          </div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <b>프로덕션 권고</b>: AWS Cognito 연동 → 사원번호·이메일 기반 SSO + IAM 역할 관리
            <div className="text-xs text-stone-500 mt-1">시스템 통합 시 안전보건팀 그룹만 업로드 권한 부여</div>
          </div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <b>감사 로그</b>: 업로드 시각·파일명·사용자 기록 → S3 저장 → CloudTrail 연계
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== Main App ==========
// === 5허브 정보 구조 ===
export default AdminUpload;
