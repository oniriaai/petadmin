import type { ElementType, ReactNode } from "react";
import { cls } from "../../lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ElementType;
  count?: number;
}

/**
 * The underline tab bar. Three pages each had their own; this is the one.
 * The active tab takes the action colour, so it follows the console's theme as well.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cls("flex gap-1 overflow-x-auto border-b border-line-subtle", className)}
    >
      {items.map(({ id, label: text, icon: Icon, count }) => {
        const isActive = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cls(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-action text-action"
                : "border-transparent text-muted hover:border-line hover:text-ink",
            )}
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            {text}
            {count != null && (
              <span className="badge bg-sunken px-1.5 text-muted tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
