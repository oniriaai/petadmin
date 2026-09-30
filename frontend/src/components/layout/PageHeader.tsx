import type { ReactNode } from "react";

/**
 * The title / subtitle / actions block at the top of a page.
 *
 * This markup was copy-pasted in 13 pages with small drifts in spacing and muted colour. Having
 * one component means a change to page headings is one edit, and it is the natural place to make
 * them behave at phone width — the actions now wrap under the title instead of squeezing it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
