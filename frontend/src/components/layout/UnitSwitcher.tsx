import { useAuth } from "../../lib/auth-context";
import { businessUnitLabel } from "../../modules/shared/contracts";

/**
 * Consolidated / Guardería / Peluquería, for roles that span both units.
 *
 * Moved out of the sidebar header: it scopes the whole workspace, so it belongs in the topbar
 * next to the daycare it scopes, and it has to stay reachable when the sidebar is collapsed.
 * The options are the units the daycare actually bought, not a hard-coded pair.
 */
/**
 * `topbar` hides itself on narrow screens, where there is no room beside the daycare name;
 * `drawer` is the same control inside the mobile navigation, so the unit stays switchable on a
 * phone. Without the second placement the control simply did not exist below 640px.
 */
export function UnitSwitcher({ variant = "topbar" }: { variant?: "topbar" | "drawer" }) {
  const { user, units, activeBusinessUnit, setActiveBusinessUnit } = useAuth();
  const spansBothUnits = user?.role === "admin" || user?.role === "superadmin";
  if (!spansBothUnits || units.length < 2) return null;

  const isDrawer = variant === "drawer";

  return (
    <label className={isDrawer ? "block px-2 pb-3" : "hidden sm:flex items-center gap-2"}>
      <span
        className={
          isDrawer
            ? "block text-[11px] font-semibold uppercase tracking-wider text-shell-muted mb-1 px-1"
            : "sr-only"
        }
      >
        Unidad de negocio
      </span>
      <select
        value={activeBusinessUnit ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          setActiveBusinessUnit(value === "DAYCARE" || value === "GROOMING" ? value : null);
        }}
        className={
          isDrawer
            ? "w-full rounded-lg bg-white/10 text-shell-ink text-sm px-3 py-2 border border-white/15"
            : "input py-1.5 text-xs w-auto"
        }
      >
        <option value="">Consolidado (Ambos)</option>
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {businessUnitLabel(unit)}
          </option>
        ))}
      </select>
    </label>
  );
}
