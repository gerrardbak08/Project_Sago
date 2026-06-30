import { useState, useEffect, useMemo, useRef, useCallback, Fragment, Component } from 'react';
import { Download, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => {
    const v = r[h]; if (v == null) return "";
    const s = String(v); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const ExportBtn = ({ rows, filename }) => (
  <button onClick={() => exportCSV(rows, filename)} className="text-xs px-2.5 py-1 rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 font-medium cursor-pointer flex items-center gap-1.5 transition">
    <Download size={12} strokeWidth={2} /> CSV
  </button>
);

// 대시보드 요약을 다중시트 .xlsx 로 내보내기 (요약·영업부·재해유형·중상해 매장)
function exportSummaryXlsx(D, filename = '사고현황_요약.xlsx') {
  const k = (D && D.kpis) || {};
  const wb = XLSX.utils.book_new();

  const summary = [
    ['지표', '값'],
    ['총 사고건수', k.total ?? ''],
    ['2024', k.y2024 ?? ''], ['2025', k.y2025 ?? ''], ['2026', k.y2026 ?? ''],
    ['수도권', k.sudo ?? ''], ['지방', k.jibang ?? ''], ['기타', k.etc ?? ''],
    ['총 근로손실일수', k.loss_days_total ?? ''],
    ['중상해(근로손실 91일↑)', (D && D.severe91 && D.severe91.total) ?? ''],
    ['중상해 근로손실일수', (D && D.severe91 && D.severe91.loss_days_total) ?? ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '요약');

  const dept = [['영업부', '총건', '2024', '2025', '2026'],
    ...((D && D.depts) || []).map(d => [d.dept, d.total, d.y24, d.y25, d.y26])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dept), '영업부별');

  const type = [['재해유형', '건수'],
    ...Object.entries((D && D.injury) || {}).sort((a, b) => b[1] - a[1])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(type), '재해유형별');

  const sev = [['매장', '영업부', '팀', '91일↑건수', '최장근로손실', '총근로손실', '최근일자'],
    ...((D && D.severe91 && D.severe91.stores) || []).map(s => [s.store, s.dept, s.team, s.count, s.maxDays, s.lossDays, s.recentDate])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sev), '중상해매장');

  XLSX.writeFile(wb, filename);
}

// 엑셀 다운로드 버튼
const XlsxBtn = ({ D, filename }) => (
  <button onClick={() => exportSummaryXlsx(D, filename)}
    className="h-7 px-2.5 rounded-md border border-emerald-200 text-xs font-medium text-emerald-700 bg-white hover:bg-emerald-50 cursor-pointer flex items-center gap-1 transition">
    <FileSpreadsheet size={12} strokeWidth={2} /> 엑셀
  </button>
);

// 요소를 PNG 이미지로 캡처해 다운로드 (PPT 붙여넣기용)
async function exportElementPng(el, filename = '대시보드.png') {
  if (!el || typeof html2canvas !== 'function') return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: -window.scrollY });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

// 이미지(PNG) 다운로드 버튼 — targetId 요소를 캡처
const ImageBtn = ({ targetId, filename }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy}
      onClick={async () => { setBusy(true); try { await exportElementPng(document.getElementById(targetId), filename); } catch (e) { console.warn('이미지 캡처 실패', e); } finally { setBusy(false); } }}
      className="h-7 px-2.5 rounded-md border border-blue-200 text-xs font-medium text-[#1D4ED8] bg-white hover:bg-blue-50 cursor-pointer flex items-center gap-1 transition disabled:opacity-50">
      <ImageIcon size={12} strokeWidth={2} /> {busy ? '생성중…' : '이미지'}
    </button>
  );
};

export { exportCSV, ExportBtn, exportSummaryXlsx, XlsxBtn, exportElementPng, ImageBtn };