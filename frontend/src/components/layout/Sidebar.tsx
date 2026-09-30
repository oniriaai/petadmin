import { NavLink } from "react-router-dom";
import { Compass, LayoutDashboard, LogOut, PawPrint, Scissors, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { frontendModules, ModuleNavigationItem } from "../../modules/registry";
import { cls } from "../../lib/utils";
import { UnitSwitcher } from "./UnitSwitcher";

/**
 * Primary navigation.
 *
 * Renders in three configurations from one tree: full width, collapsed to icons (desktop), and as
 * an off-canvas drawer (mobile). The item filtering is identical in all three — role, active
 * business unit and product-module entitlement — so a hidden item is hidden everywhere.
 */
export function Sidebar({
  isCollapsed = false,
  isDrawer = false,
  onNavigate,
}: {
  isCollapsed?: boolean;
  isDrawer?: boolean;
  onNavigate?: () => void;
}) {
  const { user, logout, activeBusinessUnit, hasModules, fullAccess } = useAuth();
  const effectiveUnit = activeBusinessUnit ?? (user?.businessUnit === "GLOBAL" ? null : user?.businessUnit);
  const isDaycare = effectiveUnit === "DAYCARE";
  const isGrooming = effectiveUnit === "GROOMING";

  // Collapsed mode has no room for labels, and a drawer is always full width.
  const compact = isCollapsed && !isDrawer;

  const spansBothUnits = user?.role === "admin" || user?.role === "superadmin";
  const unitLabel = isDaycare ? "Guardería" : isGrooming ? "Peluquería" : spansBothUnits ? "Consolidado" : "";

  const shouldShowItem = (item: ModuleNavigationItem) => {
    // No `?? "admin"` fallback: an undefined user used to be treated as an administrator and
    // shown everything.
    if (item.roles && !(user && item.roles.includes(user.role as never))) return false;
    if (item.unit && effectiveUnit && item.unit !== effectiveUnit) return false;
    // A superadmin is not restricted by entitlements, matching the backend gate.
    if (!fullAccess && !hasModules(item.requires)) return false;
    return true;
  };

  const visibleModules = frontendModules
    .map((module) => ({
      ...module,
      navigation: module.navigation && {
        ...module.navigation,
        items: module.navigation.items.filter(shouldShowItem),
      },
    }))
    .filter((module) => module.navigation && module.navigation.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-shell text-shell-ink">
      <div
        className={cls(
          "flex items-center gap-3 border-b border-white/10 px-4 py-4",
          compact && "justify-center px-2",
        )}
      >
        <div
          className={cls(
            "w-9 h-9 rounded-xl grid place-items-center shrink-0 text-white",
            isDaycare ? "bg-daycare-600" : isGrooming ? "bg-grooming-700" : "bg-white/15",
          )}
        >
          {isDaycare ? <PawPrint size={18} /> : isGrooming ? <Scissors size={18} /> : <Compass size={18} />}
        </div>
        {!compact && (
          <div className="min-w-0 flex-1">
            {/* The daycare is named in the topbar; this says which unit you are working in. */}
            <p className="text-[11px] uppercase tracking-wider text-shell-muted font-semibold truncate">
              {unitLabel}
            </p>
            <p className="text-sm font-bold leading-tight truncate">{user?.name ?? user?.username}</p>
          </div>
        )}
        {isDrawer && (
          <button onClick={onNavigate} className="icon-button text-shell-muted hover:text-white" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Navegación principal">
        {/* The topbar switcher is hidden on narrow screens, so the drawer carries it there. */}
        {isDrawer && <UnitSwitcher variant="drawer" />}

        <NavLink
          to="/"
          end
          onClick={onNavigate}
          title={compact ? "Dashboard Principal" : undefined}
          className={({ isActive }) => cls("sidebar-link", compact && "justify-center px-2", isActive && "active")}
        >
          <LayoutDashboard size={16} className="shrink-0" />
          {!compact && <span>Dashboard Principal</span>}
        </NavLink>

        {visibleModules.map((module) => {
          const ModuleIcon = module.navigation!.icon;
          return (
            <div key={module.id}>
              {compact ? (
                <div className="h-px bg-white/10 mx-2 mb-2" role="presentation" />
              ) : (
                <p className="px-3 text-[11px] font-bold text-shell-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ModuleIcon size={13} /> {module.navigation!.label}
                </p>
              )}
              <div className="space-y-0.5">
                {module.navigation!.items.map(({ to, label, icon: ItemIcon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    title={compact ? label : undefined}
                    className={({ isActive }) =>
                      cls("sidebar-link", compact && "justify-center px-2", isActive && "active")
                    }
                  >
                    <ItemIcon size={16} className="shrink-0" />
                    {!compact && <span>{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-white/10">
        <button
          onClick={logout}
          title={compact ? "Cerrar sesión" : undefined}
          className={cls(
            "sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10",
            compact && "justify-center px-2",
          )}
        >
          <LogOut size={16} className="shrink-0" />
          {!compact && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
}
