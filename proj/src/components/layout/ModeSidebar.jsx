// 모드 공용 좌측 고정 사이드바 — 근로자/고객/알림 모드 전환 시에도 항상 표시.
// header(로고+타이틀) + 모드 스위처(근로자/고객/알림) + nav(children) + PLAY SAFE 풋터.
import DAISO_LOGO from '../../data/logo.js';

const MODES = [["worker", "근로자"], ["customer", "고객"], ["alert", "알림"]];

function ModeSidebar({ dashMode, onSwitchMode, title, subtitle, children }) {
  return (
    <aside className="hidden lg:flex flex-col w-[232px] fixed left-0 top-0 h-screen text-white z-40" style={{ background: "linear-gradient(180deg,#0A3E8F 0%,#071E4A 42%,#002B6D 100%)" }}>
      <div className="px-4 pt-5 pb-3 flex items-center gap-2 border-b border-white/10">
        <img src={DAISO_LOGO} alt="DAISO" style={{ height: 42, width: "auto", objectFit: "contain", flexShrink: 0 }} />
        <div className="min-w-0">
          <div className="font-extrabold text-sm leading-tight truncate">{title}</div>
          <div className="text-[10px] text-white/50 leading-tight mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="px-3 py-3 grid grid-cols-3 gap-1 border-b border-white/10">
        {MODES.map(([m, l]) => (
          <button key={m} onClick={() => onSwitchMode(m)}
            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${dashMode === m ? "bg-white text-[#002B6D]" : "text-white/65 bg-white/5 hover:bg-white/10"}`}>{l}</button>
        ))}
      </div>
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">{children}</nav>
      <div className="px-4 py-3 border-t border-white/10">
        <div className="text-[11px] font-extrabold text-white/70 tracking-[0.2em]">PLAY SAFE</div>
        <div className="text-[10px] text-white/40 mt-0.5">안전은 오늘의 습관, 내일의 행복</div>
      </div>
    </aside>
  );
}

// 평면(flat) 탭 네비 — 고객/알림 모드용
function SidebarFlatNav({ items, active, onSelect, accent = "#002B6D" }) {
  return (
    <>
      {items.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onSelect(t.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold transition cursor-pointer flex items-center gap-2 ${on ? "bg-white text-[#002B6D]" : "text-white/65 hover:bg-white/[0.08] hover:text-white"}`}>
            {t.Icon && <t.Icon size={15} strokeWidth={2} className="flex-shrink-0" />}
            <span className="flex-1">{t.l}</span>
          </button>
        );
      })}
    </>
  );
}

export default ModeSidebar;
export { SidebarFlatNav };
