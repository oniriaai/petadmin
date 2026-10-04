import { businessUnitLabel } from "../../modules/shared/contracts";
import type { BusinessUnit } from "../../modules/shared/contracts";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";

/** The small unit badge the consolidated view uses in place of a screen-wide unit colour. */
export function UnitBadge({
  unit,
  className,
}: {
  unit: BusinessUnit | null | undefined;
  className?: string;
}) {
  return (
    <span className={cls("badge", unitTheme(unit).badge, className)}>
      {unit ? businessUnitLabel(unit) : "Consolidado"}
    </span>
  );
}
