import { useState, useEffect, useMemo, useRef, useCallback, Fragment, Component } from 'react';
import { Download } from 'lucide-react';

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

export { exportCSV, ExportBtn };