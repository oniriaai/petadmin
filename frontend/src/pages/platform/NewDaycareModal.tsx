import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { platformApi, type ModuleCatalog } from "../../lib/platform-api";
import { useAsync } from "./shared";
import { businessUnitLabel } from "../../modules/shared/contracts";

/** Turns a display name into a candidate url-safe identifier. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function NewDaycareModal({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: ModuleCatalog;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [timezone, setTimezone] = useState("America/Guayaquil");
  const [units, setUnits] = useState<string[]>(["DAYCARE", "GROOMING"]);
  const [modules, setModules] = useState<string[]>(["reservas", "finanzas", "informes"]);
  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const { run, isLoading, error } = useAsync();

  const effectiveSlug = slugTouched ? slug : slugify(name);

  /**
   * Dependencies are enforced by the server, which is the only place that can be trusted; this
   * mirrors them so the operator is not made to submit a form to learn that Guardería needs
   * Reservas.
   */
  const toggleModule = (id: string) => {
    setModules((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        // Turning a prerequisite off takes its dependants with it.
        for (const candidate of catalog.modules) {
          if (candidate.requires.includes(id)) next.delete(candidate.id);
        }
      } else {
        next.add(id);
        for (const required of catalog.modules.find((m) => m.id === id)?.requires ?? []) {
          next.add(required);
        }
      }
      return [...next];
    });
  };

  const toggleUnit = (unit: string) => {
    setUnits((current) =>
      current.includes(unit) ? current.filter((u) => u !== unit) : [...current, unit],
    );
  };

  const suggestion = useMemo(
    () =>
      effectiveSlug && adminUsername && !adminUsername.startsWith(`${effectiveSlug}_`)
        ? `${effectiveSlug}_${adminUsername}`
        : null,
    [effectiveSlug, adminUsername],
  );

  const canSubmit =
    name.trim().length > 0 &&
    effectiveSlug.length >= 2 &&
    units.length > 0 &&
    adminName.trim().length > 0 &&
    adminUsername.trim().length >= 3 &&
    adminPassword.length >= 8;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const created = await run(() =>
      platformApi.createDaycare({
        slug: effectiveSlug,
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        timezone: timezone.trim() || undefined,
        units,
        modules,
        admin: { username: adminUsername.trim(), password: adminPassword, name: adminName.trim() },
      }),
    );
    if (created) onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 overflow-auto"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        data-theme="platform"
        className="card w-full max-w-2xl p-6 my-8"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
          color: "var(--color-ink)",
        }}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold">Nueva guardería</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              Se crea con sus módulos y su primer administrador.
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" style={{ color: "var(--color-muted)" }} htmlFor="nd-name">
              Nombre
            </label>
            <input
              id="nd-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                background: "var(--color-canvas)",
                color: "var(--color-ink)",
                borderColor: "var(--color-border)",
              }}
            />
          </div>
          <div>
            <label className="label" style={{ color: "var(--color-muted)" }} htmlFor="nd-slug">
              Identificador
            </label>
            <input
              id="nd-slug"
              className="input font-mono"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              required
              style={{
                background: "var(--color-canvas)",
                color: "var(--color-ink)",
                borderColor: "var(--color-border)",
              }}
            />
          </div>
          <div>
            <label className="label" style={{ color: "var(--color-muted)" }} htmlFor="nd-legal">
              Razón social (opcional)
            </label>
            <input
              id="nd-legal"
              className="input"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              style={{
                background: "var(--color-canvas)",
                color: "var(--color-ink)",
                borderColor: "var(--color-border)",
              }}
            />
          </div>
          <div>
            <label className="label" style={{ color: "var(--color-muted)" }} htmlFor="nd-tz">
              Zona horaria
            </label>
            <input
              id="nd-tz"
              className="input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                background: "var(--color-canvas)",
                color: "var(--color-ink)",
                borderColor: "var(--color-border)",
              }}
            />
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="label" style={{ color: "var(--color-muted)" }}>
            Unidades de negocio
          </legend>
          <div className="flex gap-2">
            {catalog.units.map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => toggleUnit(unit)}
                className={`btn btn-sm ${units.includes(unit) ? "btn-primary" : "btn-secondary"}`}
                style={
                  units.includes(unit)
                    ? undefined
                    : {
                        background: "var(--color-canvas)",
                        color: "var(--color-muted)",
                        borderColor: "var(--color-border)",
                      }
                }
              >
                {businessUnitLabel(unit)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="label" style={{ color: "var(--color-muted)" }}>
            Módulos incluidos
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.modules.map((module) => (
              <label
                key={module.id}
                className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer hover:bg-white/5"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={modules.includes(module.id)}
                  onChange={() => toggleModule(module.id)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{module.label}</span>
                  {module.requires.length > 0 && (
                    <span className="block text-[11px]" style={{ color: "var(--color-muted)" }}>
                      Requiere: {module.requires.join(", ")}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="label" style={{ color: "var(--color-muted)" }}>
            Primer administrador
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                className="label text-xs"
                style={{ color: "var(--color-muted)" }}
                htmlFor="nd-an"
              >
                Nombre
              </label>
              <input
                id="nd-an"
                className="input"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                style={{
                  background: "var(--color-canvas)",
                  color: "var(--color-ink)",
                  borderColor: "var(--color-border)",
                }}
              />
            </div>
            <div>
              <label
                className="label text-xs"
                style={{ color: "var(--color-muted)" }}
                htmlFor="nd-au"
              >
                Usuario
              </label>
              <input
                id="nd-au"
                className="input font-mono"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                required
                minLength={3}
                style={{
                  background: "var(--color-canvas)",
                  color: "var(--color-ink)",
                  borderColor: "var(--color-border)",
                }}
              />
              {suggestion && (
                <button
                  type="button"
                  className="text-[11px] mt-1 hover:underline"
                  style={{ color: "var(--color-muted)" }}
                  onClick={() => setAdminUsername(suggestion)}
                >
                  Usar {suggestion}
                </button>
              )}
            </div>
            <div>
              <label
                className="label text-xs"
                style={{ color: "var(--color-muted)" }}
                htmlFor="nd-ap"
              >
                Contraseña
              </label>
              <input
                id="nd-ap"
                type="password"
                className="input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                minLength={8}
                style={{
                  background: "var(--color-canvas)",
                  color: "var(--color-ink)",
                  borderColor: "var(--color-border)",
                }}
              />
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--color-muted)" }}>
            El usuario debe ser único en todo el sistema: el inicio de sesión no pide la guardería.
          </p>
        </fieldset>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{
              background: "var(--color-canvas)",
              color: "var(--color-muted)",
              borderColor: "var(--color-border)",
            }}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || isLoading}>
            {isLoading ? "Creando..." : "Crear guardería"}
          </button>
        </div>
      </form>
    </div>
  );
}
