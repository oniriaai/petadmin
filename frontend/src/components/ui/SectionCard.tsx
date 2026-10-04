import type { ReactNode } from "react";
import { cls } from "../../lib/utils";

/** A card with a titled header and an optional action on the right. */
export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
  "aria-label": ariaLabel,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <section className={cls("card overflow-hidden", className)} aria-label={ariaLabel}>
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-5">
        <h2 className="section-title flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {action && <div className="flex shrink-0 items-center gap-2 text-sm">{action}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
