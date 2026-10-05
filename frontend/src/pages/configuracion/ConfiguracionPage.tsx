import { useCallback, useEffect, useState } from "react";
import { Download, BarChart3, Building2, Check, Settings } from "lucide-react";
import { api, ApiError, downloadFile } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { ListSkeleton, Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";
import { businessUnitLabel } from "../../modules/shared/contracts";
import type { BusinessUnit } from "../../modules/shared/contracts";
import { EquipoSection } from "./EquipoSection";

interface UnitSetting {
  businessUnit: BusinessUnit;
  timezone: string;
  vatPercent: number;
  isConfigured: boolean;
  updatedAt: string | null;
}

interface SettingsResponse {
  daycare: {
    id: string;
    slug: string;
    name: string;
    legalName: string | null;
    timezone: string;
    isActive: boolean;
  };
  units: UnitSetting[];
}

export function ConfiguracionPage() {
  const { hasModule, fullAccess } = useAuth();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { timezone: string; vatPercent: string }>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUnit, setSavingUnit] = useState<string | null>(null);
  const [savedUnit, setSavedUnit] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SettingsResponse>("/settings");
      setSettings(data);
      setDrafts(
        Object.fromEntries(
          data.units.map((unit) => [
            unit.businessUnit,
            { timezone: unit.timezone, vatPercent: String(unit.vatPercent) },
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos cargar la configuración. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(unit: UnitSetting) {
    const draft = drafts[unit.businessUnit];
    if (!draft) return;
    setSavingUnit(unit.businessUnit);
    setError(null);
    try {
      const updated = await api.put<UnitSetting>(`/settings/${unit.businessUnit}`, {
        timezone: draft.timezone.trim(),
        vatPercent: Number(draft.vatPercent),
      });
      setSettings((current) =>
        current
          ? {
              ...current,
              units: current.units.map((u) => (u.businessUnit === unit.businessUnit ? updated : u)),
            }
          : current,
      );
      setSavedUnit(unit.businessUnit);
      setTimeout(() => setSavedUnit(null), 2000);
    } catch (err) {
      // The server refuses an unrecognised timezone by name; showing its message is the point.
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    } finally {
      setSavingUnit(null);
    }
  }

  async function download(path: string, filename: string, key: string) {
    setDownloading(key);
    try {
      await downloadFile(path, filename);
    } catch {
      setError("No pudimos descargar el archivo. Inténtalo de nuevo.");
    } finally {
      setDownloading(null);
    }
  }

  const canExport = fullAccess || hasModule("informes");

  function isDirty(unit: UnitSetting): boolean {
    const draft = drafts[unit.businessUnit];
    if (!draft) return false;
    return draft.timezone !== unit.timezone || Number(draft.vatPercent) !== unit.vatPercent;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <PageHeader title="Configuración" subtitle="Parámetros de tu guardería" />

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        settings && (
          <>
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-ink border-b border-line-subtle pb-3 flex items-center gap-2">
                <Building2 size={17} /> Guardería
              </h2>
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted">Nombre</dt>
                  <dd className="font-medium">{settings.daycare.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">Identificador</dt>
                  <dd className="font-mono text-xs">{settings.daycare.slug}</dd>
                </div>
                {settings.daycare.legalName && (
                  <div>
                    <dt className="text-muted">Razón social</dt>
                    <dd className="font-medium">{settings.daycare.legalName}</dd>
                  </div>
                )}
              </dl>
              {/* Identity is the vendor's to change, not the tenant's. Saying so beats offering
                  fields that would be refused. */}
              <p className="text-xs text-muted">
                Estos datos y las unidades de negocio contratadas los gestiona el proveedor del
                sistema.
              </p>
            </div>

            {settings.units.map((unit) => {
              const draft = drafts[unit.businessUnit] ?? {
                timezone: unit.timezone,
                vatPercent: String(unit.vatPercent),
              };
              const dirty = isDirty(unit);
              return (
                <div key={unit.businessUnit} className="card p-5 space-y-4">
                  <h2 className="font-semibold text-ink border-b border-line-subtle pb-3 flex items-center gap-2">
                    <Settings size={17} /> {businessUnitLabel(unit.businessUnit)}
                  </h2>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor={`vat-${unit.businessUnit}`}>
                        IVA por defecto (%)
                      </label>
                      <input
                        id={`vat-${unit.businessUnit}`}
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={draft.vatPercent}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [unit.businessUnit]: { ...draft, vatPercent: e.target.value },
                          }))
                        }
                      />
                      <p className="text-xs text-muted mt-1">
                        Se aplica a reservas y citas nuevas que no indiquen otro valor.
                      </p>
                    </div>
                    <div>
                      <label className="label" htmlFor={`tz-${unit.businessUnit}`}>
                        Zona horaria
                      </label>
                      <input
                        id={`tz-${unit.businessUnit}`}
                        className="input"
                        value={draft.timezone}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [unit.businessUnit]: { ...draft, timezone: e.target.value },
                          }))
                        }
                      />
                      <p className="text-xs text-muted mt-1">
                        Determina los horarios que genera el planificador de planes recurrentes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void save(unit)}
                      disabled={savingUnit === unit.businessUnit || !dirty}
                      className="btn-primary"
                    >
                      {savingUnit === unit.businessUnit ? <Spinner size={14} /> : null}
                      {savedUnit === unit.businessUnit ? (
                        <>
                          <Check size={15} /> Guardado
                        </>
                      ) : (
                        "Guardar cambios"
                      )}
                    </button>
                    {!unit.isConfigured && (
                      <span className="text-xs text-muted">Usando valores por defecto</span>
                    )}
                  </div>
                </div>
              );
            })}

            <EquipoSection />

            {canExport && (
              <div className="card p-5 space-y-4">
                <h2 className="font-semibold text-ink border-b border-line-subtle pb-3 flex items-center gap-2">
                  <Download size={17} /> Exportar datos
                </h2>
                <p className="text-sm text-muted">
                  Descarga tus datos en formato Excel para análisis externo o Power BI.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      label: "Clientes",
                      path: "/export/clients",
                      filename: "clientes.xlsx",
                      key: "clients",
                    },
                    {
                      label: "Reservas",
                      path: "/export/reservations",
                      filename: "reservas.xlsx",
                      key: "reservations",
                    },
                    {
                      label: "Ingresos",
                      path: "/export/incomes",
                      filename: "ingresos.xlsx",
                      key: "incomes",
                    },
                    {
                      label: "Gastos y Compras",
                      path: "/export/expenses",
                      filename: "gastos-compras.xlsx",
                      key: "expenses",
                    },
                  ].map(({ label, path, filename, key }) => (
                    <button
                      key={key}
                      onClick={() => void download(path, filename, key)}
                      disabled={!!downloading}
                      className="btn-secondary justify-center"
                    >
                      {downloading === key ? <Spinner size={14} /> : <Download size={14} />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canExport && (
              <div className="card p-5 space-y-3">
                <h2 className="font-semibold text-ink border-b border-line-subtle pb-3 flex items-center gap-2">
                  <BarChart3 size={17} /> Power BI
                </h2>
                <div className="p-4 bg-info-soft rounded-xl text-sm text-info-ink space-y-2">
                  <p className="font-medium">Instrucciones para cargar en Power BI:</p>
                  <ol className="list-decimal list-inside space-y-1 text-action">
                    <li>Descarga los archivos Excel de la sección anterior</li>
                    <li>Abre Power BI Desktop</li>
                    <li>Selecciona "Obtener datos" → "Excel"</li>
                    <li>Importa cada archivo (clientes, reservas, ingresos, gastos)</li>
                    <li>Crea relaciones entre tablas usando los IDs</li>
                    <li>Construye visualizaciones con los datos</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
