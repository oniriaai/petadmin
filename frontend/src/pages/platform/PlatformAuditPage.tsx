import { useEffect, useState } from "react";
import { platformApi, type AuditEntry } from "../../lib/platform-api";
import { PlatformPage, auditLine, useAsync } from "./shared";

export function PlatformAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const { run, isLoading, error } = useAsync();

  useEffect(() => {
    void run(async () => setEntries(await platformApi.audit(200)));
  }, [run]);

  return (
    <PlatformPage
      title="Auditoría"
      subtitle="Quién cambió qué en la consola de plataforma"
      isLoading={isLoading}
      error={error}
    >
      <div
        className="card divide-y"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {entries.length === 0 && (
          <p className="p-4 text-sm" style={{ color: "var(--color-muted)" }}>
            Sin actividad registrada.
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-3 text-sm flex items-baseline gap-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span className="text-xs shrink-0 font-mono" style={{ color: "var(--color-muted)" }}>
              {new Date(entry.createdAt).toLocaleString("es-EC", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
            <span className="min-w-0">{auditLine(entry)}</span>
          </div>
        ))}
      </div>
    </PlatformPage>
  );
}
