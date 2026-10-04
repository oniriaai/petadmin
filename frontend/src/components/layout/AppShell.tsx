import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Menu } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";
import { Sidebar } from "./Sidebar";
import { PlatformBanner } from "./PlatformBanner";
import { UnitSwitcher } from "./UnitSwitcher";
import { UserMenu } from "./UserMenu";
import { UnitBadge } from "../ui/UnitBadge";
import { normalizeBusinessUnit } from "../../modules/shared/contracts";

const COLLAPSE_KEY = "sidebarCollapsed";

/**
 * The daycare workspace shell: navigation, a topbar, and the page.
 *
 * Before this there was no header at all and the sidebar was a fixed `w-64` with no responsive
 * classes, so the application could not be used below roughly 768px. The sidebar now collapses to
 * icons on desktop and becomes an off-canvas drawer on small screens.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { daycare, user } = useAuth();
  const location = useLocation();
  const ownUnit = normalizeBusinessUnit(user?.businessUnit);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    // A per-viewer convenience. Storage can throw in a private window, and the shell must still
    // render, so failure just means "not collapsed".
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  function toggleCollapsed() {
    setIsCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore: the preference is not worth failing a render over */
      }
      return next;
    });
  }

  // Navigating inside the drawer must close it, otherwise the destination is hidden behind it.
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer, which is the expected way out of an overlay.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  return (
    <div className="min-h-[100dvh] bg-canvas flex">
      {/* Desktop navigation. Hidden below lg, where the drawer takes over. */}
      <aside
        className={cls(
          // Navigation and topbar stay off paper: prescriptions and histories print from here.
          "hidden lg:flex print:hidden shrink-0 h-[100dvh] sticky top-0 transition-[width] duration-200",
          isCollapsed ? "w-sidebar-collapsed" : "w-sidebar",
        )}
      >
        <Sidebar isCollapsed={isCollapsed} />
      </aside>

      {/* Mobile drawer. */}
      {isDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-drawer">
          <button
            className="absolute inset-0 bg-[rgb(28_25_23/0.5)]"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Cerrar menú"
            tabIndex={-1}
          />
          <div className="relative h-full w-sidebar max-w-[85vw] shadow-overlay">
            <Sidebar isDrawer onNavigate={() => setIsDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-shell bg-raised border-b border-line-subtle print:hidden">
          <div className="flex items-center gap-2 px-3 sm:px-4 h-14">
            <button
              className="icon-button lg:hidden text-muted"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={isDrawerOpen}
            >
              <Menu size={20} />
            </button>
            <button
              className="icon-button hidden lg:inline-flex text-muted"
              onClick={toggleCollapsed}
              aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
            >
              {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink truncate leading-tight">
                {daycare?.name ?? "Argos Suite"}
              </p>
              {daycare?.legalName && (
                <p className="text-[11px] text-muted truncate leading-tight">{daycare.legalName}</p>
              )}
            </div>

            {/* A unit-scoped role has no switcher, so the topbar says which unit this is. */}
            {ownUnit && <UnitBadge unit={ownUnit} className="hidden sm:inline-flex" />}
            <UnitSwitcher />
            <UserMenu />
          </div>
          {/* Inside the topbar so it cannot be scrolled away while the vendor is operating. */}
          <PlatformBanner />
        </header>

        <main className="flex-1 min-w-0" key={user?.id}>
          {children}
        </main>
      </div>
    </div>
  );
}
