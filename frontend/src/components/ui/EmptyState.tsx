import type { ElementType, ReactNode } from "react";
import { cls } from "../../lib/utils";

/**
 * What a list shows when it has nothing: one warm sentence that says what is missing and,
 * where there is one, the action that fills it.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon?: ElementType;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cls("px-4 text-center", compact ? "py-6" : "py-10", className)}>
      {Icon && <Icon size={compact ? 20 : 26} className="mx-auto mb-2 text-faint" aria-hidden />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
