import { useState } from "react";
import type React from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, ChevronsLeft, ChevronsRight, LayoutDashboard, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { frontendModules, ModuleNavigationItem } from "../../modules/registry";
import { normalizeBusinessUnit } from "../../modules/shared/contracts";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";
import { Lockup, Mark } from "../brand/Logo";
import { UnitSwitcher } from "./UnitSwitcher";

const FOLDED_KEY = "sidebarGroups";

// A per-viewer convenience, like the collapsed state: storage that throws or holds something
// else just means "nothing folded".
function readFolded(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

interface Tip {
  label: string;
  top: number;
  left: number;
}

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
  onToggleCollapsed,
}: {
  isCollapsed?: boolean;
  isDrawer?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const { user, activeBusinessUnit, hasModules, canAll, fullAccess } = useAuth();
  const effectiveUnit = activeBusinessUnit ?? normalizeBusinessUnit(user?.businessUnit);

  // Collapsed mode has no room for labels, and a drawer is always full width.
  const compact = isCollapsed && !isDrawer;

  const [folded, setFolded] = useState(readFolded);
  const [tip, setTip] = useState<Tip | null>(null);

  function toggleGroup(id: string) {
    setFolded((current) => {
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
      try {
        localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
      } catch {
        /* ignore: the preference is not worth failing a render over */
      }
      return next;
    });
  }

  const shouldShowItem = (item: ModuleNavigationItem) => {
    // No `?? "admin"` fallback: an undefined user used to be treated as an administrator and
    // shown everything.
    if (item.roles && !(user && item.roles.includes(user.role as never))) return false;
    if (item.unit && effectiveUnit && item.unit !== effectiveUnit) return false;
    // A superadmin is not restricted by entitlements, matching the backend gate.
    if (!fullAccess && !hasModules(item.requires)) return false;
    if (!canAll(item.permissions)) return false;
    return true;
  };

  const visibleItems = frontendModules.flatMap((module) =>
    (module.navigation?.items ?? []).filter(shouldShowItem),
  );
  const footerItems = visibleItems.filter((item) => item.placement === "footer");
  const groups = frontendModules
    .map((module) => ({
      id: module.id,
      label: module.navigation?.label ?? module.label,
      items: (module.navigation?.items ?? []).filter(
        (item) => item.placement !== "footer" && shouldShowItem(item),
      ),
    }))
    .filter((group) => group.items.length > 0);

  // "/veterinaria" is a prefix of "/veterinaria/farmacia", so prefix matching alone lights up two
  // items at once. Only the longest matching item is the current one.
  const { pathname } = useLocation();
  const currentItem = visibleItems
    .map((item) => item.to)
    .filter((to) => pathname === to || pathname.startsWith(`${to}/`))
    .sort((a, b) => b.length - a.length)[0];

  // The collapsed rail has no labels, so each control names itself beside the pointer or the
  // focus ring. One fixed element placed by hand: the nav scrolls, and a scrolling box clips
  // anything a link draws outside itself.
  function showTip(event: React.SyntheticEvent) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!target?.dataset.tip) return setTip(null);
    const box = target.getBoundingClientRect();
    setTip({ label: target.dataset.tip, top: box.top + box.height / 2, left: box.right + 12 });
  }
  const hideTip = () => setTip(null);

  const navItem = (to: string, label: string, Icon: LucideIcon, isCurrent: boolean) => (
    <Link
      key={to}
      to={to}
      onClick={onNavigate}
      className={cls(
        "sidebar-link",
        compact && "justify-center px-0",
        isDrawer && "min-h-11",
        isCurrent && "active",
      )}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={compact ? label : undefined}
      data-tip={compact ? label : undefined}
    >
      <Icon size={18} strokeWidth={1.75} className="sidebar-link-icon" aria-hidden="true" />
      {!compact && <span className="truncate">{label}</span>}
    </Link>
  );

  return (
    <div
      className="flex h-full w-full flex-col bg-shell text-shell-ink"
      // The active nav item reads the unit's colour from here; Oro when consolidated.
      style={{ "--unit-accent": unitTheme(effectiveUnit).accent } as React.CSSProperties}
      {...(compact && {
        onMouseOver: showTip,
        onMouseLeave: hideTip,
        onFocus: showTip,
        onBlur: hideTip,
        onClick: hideTip,
      })}
    >
      <div
        className={cls(
          "flex items-center pt-4",
          compact ? "flex-col gap-2 px-3" : "justify-between pl-5 pr-2",
        )}
      >
        {compact ? <Mark size={36} /> : <Lockup tone="dark" className="w-44" />}
        {isDrawer ? (
          <button
            type="button"
            onClick={onNavigate}
            className="icon-button rounded-lg text-shell-muted hover:text-shell-ink"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        ) : (
          onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="sidebar-tool"
              aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
              data-tip={compact ? "Expandir menú" : undefined}
            >
              {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          )
        )}
      </div>

      <div className={cls("px-3", compact ? "pt-2" : "pt-4")}>
        <UnitSwitcher unit={effectiveUnit} compact={compact} />
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 pb-4 pt-3"
        aria-label="Navegación principal"
        onScroll={compact ? hideTip : undefined}
      >
        {navItem("/", "Inicio", LayoutDashboard, pathname === "/")}

        {groups.map((group) => {
          const isFolded = !compact && folded.includes(group.id);
          // Folding a group never hides where you are: its current page stays in view.
          const items = isFolded
            ? group.items.filter((item) => item.to === currentItem)
            : group.items;
          const listId = `sidebar-group-${group.id}`;
          return (
            <div key={group.id} className={compact ? "mt-2 border-t border-white/10 pt-2" : "mt-5"}>
              {!compact && (
                <button
                  type="button"
                  className={cls("sidebar-group", isDrawer && "min-h-11")}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isFolded}
                  aria-controls={listId}
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronRight
                    size={14}
                    className={cls("shrink-0 transition-transform", !isFolded && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>
              )}
              <div id={listId} className="space-y-0.5">
                {items.map((item) =>
                  navItem(item.to, item.label, item.icon, item.to === currentItem),
                )}
              </div>
            </div>
          );
        })}
      </nav>

      {footerItems.length > 0 && (
        <div className="space-y-0.5 border-t border-white/10 px-3 py-3">
          {footerItems.map((item) =>
            navItem(item.to, item.label, item.icon, item.to === currentItem),
          )}
        </div>
      )}

      {compact && tip && (
        <div className="shell-tip" style={{ top: tip.top, left: tip.left }} aria-hidden="true">
          {tip.label}
        </div>
      )}
    </div>
  );
}
