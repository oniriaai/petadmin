import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronsUpDown, Compass, PawPrint, Scissors, Stethoscope } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { businessUnitLabel } from "../../modules/shared/contracts";
import type { BusinessUnit } from "../../modules/shared/contracts";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";

const UNIT_ICONS: Record<BusinessUnit, LucideIcon> = {
  DAYCARE: PawPrint,
  GROOMING: Scissors,
  VETERINARY: Stethoscope,
};

const CONSOLIDATED = "Consolidado";

/**
 * Which unit the workspace is narrowed to, and the control that changes it.
 *
 * It sits at the top of the sidebar because it scopes everything below it: the navigation, the
 * accent and the data. A role that spans the units gets a menu of the units the daycare actually
 * bought; a unit-scoped role, or a daycare with a single unit, gets the same row as a plain
 * statement, since there is nothing to switch to. `compact` is the collapsed sidebar, where only
 * the tile fits and the menu opens beside it.
 */
export function UnitSwitcher({
  unit,
  compact = false,
}: {
  unit: BusinessUnit | null;
  compact?: boolean;
}) {
  const { user, units, setActiveBusinessUnit } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const spansUnits = user?.role === "admin" || user?.role === "superadmin";
  const canSwitch = spansUnits && units.length >= 2;
  const label = unit ? businessUnitLabel(unit) : spansUnits ? CONSOLIDATED : "";
  const Icon = unit ? UNIT_ICONS[unit] : Compass;

  // Same way out as the user menu: an outside press or Escape, so it cannot get stuck open on a
  // touch screen.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The drawer listens for Escape too; closing the menu must not also close the drawer.
      event.stopImmediatePropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);

  // Opening lands on the current choice, so the arrow keys start from where you are.
  useEffect(() => {
    if (!isOpen) return;
    const options = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    const current = Array.from(options ?? []).find(
      (option) => option.getAttribute("aria-checked") === "true",
    );
    (current ?? options?.[0])?.focus();
  }, [isOpen]);

  const tile = (
    <span
      className={cls(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-white",
        unitTheme(unit).tile,
      )}
    >
      <Icon size={15} aria-hidden="true" />
    </span>
  );

  if (!canSwitch) {
    if (!label) return null;
    return (
      <div
        className={cls("flex items-center gap-3 py-2", compact ? "justify-center" : "px-2")}
        data-tip={compact ? label : undefined}
      >
        {tile}
        {compact ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        )}
      </div>
    );
  }

  function choose(next: BusinessUnit | null) {
    setActiveBusinessUnit(next);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
    );
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      options[(to + options.length) % options.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if (event.key === "Tab") setIsOpen(false);
  }

  const choices: { value: BusinessUnit | null; label: string; icon: LucideIcon }[] = [
    { value: null, label: CONSOLIDATED, icon: Compass },
    ...units.map((value) => ({
      value,
      label: businessUnitLabel(value),
      icon: UNIT_ICONS[value],
    })),
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cls("unit-switcher", compact && "justify-center border-transparent px-0")}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Unidad de negocio: ${label}`}
        data-tip={compact && !isOpen ? label : undefined}
      >
        {tile}
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{label}</span>
            <ChevronsUpDown size={15} className="shrink-0 text-shell-muted" aria-hidden="true" />
          </>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Unidad de negocio"
          onKeyDown={onMenuKeyDown}
          className={cls(
            "shell-menu absolute z-drawer",
            compact ? "left-full top-0 ml-3 w-52" : "inset-x-0 top-full mt-1.5",
          )}
        >
          {/* Neutral rows: only the tile above carries the unit's colour (the One Unit Rule). */}
          {choices.map(({ value, label: choiceLabel, icon: ChoiceIcon }) => {
            const isCurrent = value === unit;
            return (
              <button
                key={value ?? "all"}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                className="shell-menu-item"
                onClick={() => choose(value)}
              >
                <ChoiceIcon size={16} className="shrink-0 text-shell-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{choiceLabel}</span>
                {isCurrent && <Check size={15} className="shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
