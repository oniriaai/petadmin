import type { ReactNode } from "react";
import { cls } from "../../lib/utils";

/**
 * A row of figures inside one card, divided by hairlines.
 *
 * Replaces the per-page grids of small KPI cards with coloured icon tiles: the number is the
 * content, so it gets the weight and the tile goes.
 */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cls(
        "card grid grid-cols-2 gap-px overflow-hidden bg-line-subtle sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Colours the figure when the number itself is the alarm (a full room, an overdue bill). */
  tone?: "danger" | "success" | "warning";
}) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={cls(
          "mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning-ink",
          !tone && "text-ink",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="mt-1.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}
