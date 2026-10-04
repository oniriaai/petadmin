import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ApiError } from "../../lib/api";
import type { AuditEntry } from "../../lib/platform-api";
import { ListSkeleton } from "../../components/ui/Spinner";

/**
 * Runs an async console action, keeping its loading and error state.
 *
 * Errors are surfaced with the server's Spanish message rather than a generic one: the console
 * refuses writes for reasons the operator needs to read ("this daycare still has users", "the
 * module requires Reservas"), so swallowing the message would make those refusals unusable.
 */
export function useAsync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Algo salió mal. Inténtalo de nuevo.",
      );
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { run, isLoading, error, setError };
}

export function PlatformPage({
  title,
  subtitle,
  actions,
  isLoading,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 sm:p-8 max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="text-sm mt-1 text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>

      {error && (
        <div
          className="mb-5 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      {isLoading ? <ListSkeleton rows={4} /> : children}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="card p-4 bg-surface border-line">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-3xl font-semibold tabular-nums mt-2">{value}</p>
      {hint && <p className="text-xs mt-1 text-muted">{hint}</p>}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "daycare.create": "creó la guardería",
  "daycare.update": "actualizó la guardería",
  "module.toggle": "cambió módulos",
  "user.provision": "creó un usuario",
  "user.update": "actualizó un usuario",
};

/** One human-readable audit line. Falls back to the raw action rather than hiding it. */
export function auditLine(entry: AuditEntry): string {
  const what = ACTION_LABELS[entry.action] ?? entry.action;
  const detail = summarizeDetail(entry);
  return `${entry.actorUsername} ${what}${detail ? `: ${detail}` : ""}`;
}

function summarizeDetail(entry: AuditEntry): string {
  const detail = entry.detail;
  if (!detail || typeof detail !== "object") return "";

  if (entry.action === "module.toggle" && Array.isArray(detail)) {
    const on = detail.filter((d) => d?.isEnabled).map((d) => d.moduleId);
    const off = detail.filter((d) => d && !d.isEnabled).map((d) => d.moduleId);
    return [on.length ? `+${on.join(", ")}` : "", off.length ? `−${off.join(", ")}` : ""]
      .filter(Boolean)
      .join("  ");
  }

  const record = detail as Record<string, unknown>;
  if (typeof record.username === "string") return String(record.username);
  if (typeof record.slug === "string") return String(record.slug);

  const keys = Object.keys(record).filter((key) => record[key] !== undefined);
  return keys.slice(0, 3).join(", ");
}
