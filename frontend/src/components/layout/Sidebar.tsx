import type React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Compass, LayoutDashboard, LogOut, PawPrint, Scissors, Stethoscope, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { frontendModules, ModuleNavigationItem } from "../../modules/registry";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";
import { Wordmark } from "../brand/Wordmark";
import { BrandTile } from "../brand/BrandTile";
import { Meander } from "../brand/Meander";
import { UnitSwitcher } from "./UnitSwitcher";

/**
 * Primary navigation.
 *
 * Renders in three configurations from one tree: full width, collapsed to icons (desktop), and as
 * an off-canvas drawer (mobile). The item filtering is identical in all three: role, active
 * business unit and product-module entitlement, so a hidden item is hidden everywhere.
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
  const effectiveUnit =
    activeBusinessUnit ?? (user?.businessUnit === "GLOBAL" ? null : user?.businessUnit);
  const isDaycare = effectiveUnit === "DAYCARE";
  const isGrooming = effectiveUnit === "GROOMING";
  const isVeterinary = effectiveUnit === "VETERINARY";

  // Collapsed mode has no room for labels, and a drawer is always full width.
  const compact = isCollapsed && !isDrawer;

  const spansBothUnits = user?.role === "admin" || user?.role === "superadmin";
  const unitLabel = isDaycare
    ? "Guardería"
    : isGrooming
      ? "Peluquería"
      : isVeterinary
        ? "Veterinaria"
        : spansBothUnits
          ? "Consolidado"
          : "";

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

  // "/veterinaria" is a prefix of "/veterinaria/farmacia", so prefix matching alone lights up two
  // items at once. Only the longest matching item is the current one.
  const { pathname } = useLocation();
  const currentItem = visibleModules
    .flatMap((module) => module.navigation!.items.map((item) => item.to))
    .filter((to) => pathname === to || pathname.startsWith(`${to}/`))
    .sort((a, b) => b.length - a.length)[0];

  const theme = unitTheme(effectiveUnit);
  const UnitIcon = isDaycare
    ? PawPrint
    : isGrooming
      ? Scissors
      : isVeterinary
        ? Stethoscope
        : Compass;

  return (
    <div
      className="flex flex-col h-full bg-shell text-shell-ink"
      // The active nav item and the meander read the unit's colour from here; Oro when consolidated.
      style={{ "--unit-accent": theme.accent } as React.CSSProperties}
    >
      <div
        className={cls("flex items-center gap-3 px-4 pt-5 pb-3", compact && "justify-center px-2")}
      >
        {compact ? <BrandTile /> : <Wordmark className="flex-1" />}
        {isDrawer && (
          <button
            onClick={onNavigate}
            className="icon-button text-shell-muted hover:text-shell-ink"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {/* One unit colour per logo: the band follows the unit you are working in. */}
      <div className="px-4 text-[color:var(--unit-accent)]" aria-hidden="true">
        {!compact && <Meander height={6} />}
      </div>

      <div
        className={cls(
          "flex items-center gap-3 border-b border-white/10 px-4 py-3",
          compact && "justify-center px-2",
        )}
      >
        <div
          className={cls(
            "w-8 h-8 rounded-lg grid place-items-center shrink-0 text-white",
            theme.tile,
          )}
        >
          <UnitIcon size={16} aria-hidden="true" />
        </div>
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate">
              {user?.name ?? user?.username}
            </p>
            {/* The daycare is named in the topbar; this says which unit you are working in. */}
            <p className="text-xs text-shell-muted truncate">{unitLabel}</p>
          </div>
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
          className={({ isActive }) =>
            cls("sidebar-link", compact && "justify-center px-2", isActive && "active")
          }
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
                <p className="px-3 text-[11px] font-semibold text-shell-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ModuleIcon size={13} aria-hidden="true" /> {module.navigation!.label}
                </p>
              )}
              <div className="space-y-0.5">
                {module.navigation!.items.map(({ to, label, icon: ItemIcon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    title={compact ? label : undefined}
                    className={cls(
                      "sidebar-link",
                      compact && "justify-center px-2",
                      to === currentItem && "active",
                    )}
                    aria-current={to === currentItem ? "page" : undefined}
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
          className={cls("sidebar-link w-full", compact && "justify-center px-2")}
        >
          <LogOut size={16} className="shrink-0" />
          {!compact && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
}
