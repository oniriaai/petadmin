import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Building2, LayoutDashboard, LogOut, ScrollText, ShieldCheck } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";
import { Wordmark } from "../../components/brand/Wordmark";
import { PlatformOverviewPage } from "./PlatformOverviewPage";
import { DaycaresPage } from "./DaycaresPage";
import { DaycareDetailPage } from "./DaycareDetailPage";
import { PlatformAuditPage } from "./PlatformAuditPage";

/**
 * The vendor console shell.
 *
 * `data-theme="platform"` rewrites the design tokens for this subtree, so the shared
 * `.btn`/`.card`/`.input`/`.table-*` classes render dark and indigo here without any component
 * being forked. That is what makes the console unmistakably not a daycare page.
 */
export default function PlatformApp() {
  const { user, logout, pinnedDaycareId, setPinnedDaycare } = useAuth();
  const navigate = useNavigate();

  // Entering the console means letting go of whichever tenant was being operated, so console
  // reads span every daycare rather than silently staying scoped to the last one.
  useEffect(() => {
    if (pinnedDaycareId) void setPinnedDaycare(null);
  }, [pinnedDaycareId, setPinnedDaycare]);

  const links = [
    { to: "/platform", end: true, label: "Resumen", icon: LayoutDashboard },
    { to: "/platform/daycares", end: false, label: "Guarderías", icon: Building2 },
    { to: "/platform/audit", end: false, label: "Auditoría", icon: ScrollText },
  ];

  return (
    <div data-theme="platform" className="min-h-[100dvh] flex bg-canvas text-ink">
      <aside className="w-60 shrink-0 border-r flex flex-col border-line bg-surface">
        <div className="px-4 py-5 border-b border-line">
          <Wordmark className="mb-4" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-action">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted">
                Plataforma
              </p>
              <p className="text-sm font-bold truncate">{user?.name ?? user?.username}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {links.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cls(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "text-white" : "hover:bg-white/5",
                )
              }
              style={({ isActive }) =>
                isActive ? { background: "var(--color-action)" } : { color: "var(--color-muted)" }
              }
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-line">
          <button
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full text-danger hover:bg-danger-soft transition-colors"
          >
            <LogOut size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <Routes>
          <Route index element={<PlatformOverviewPage />} />
          <Route path="daycares" element={<DaycaresPage />} />
          <Route path="daycares/:id" element={<DaycareDetailPage />} />
          <Route path="audit" element={<PlatformAuditPage />} />
          <Route path="*" element={<Navigate to="/platform" replace />} />
        </Routes>
      </main>
    </div>
  );
}
