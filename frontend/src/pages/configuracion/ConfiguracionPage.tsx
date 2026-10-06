import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Download, Send, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { InlineError } from "../../components/ui/InlineError";
import { ListSkeleton } from "../../components/ui/Spinner";
import { Tabs } from "../../components/ui/Tabs";
import type { TabItem } from "../../components/ui/Tabs";
import { PageHeader } from "../../components/layout/PageHeader";
import { remindersApi, type ChannelAvailability } from "../recordatorios/api";
import { DatosTab } from "./DatosTab";
import { EquipoSection } from "./EquipoSection";
import { NegocioTab } from "./NegocioTab";
import { RecordatoriosTab } from "./RecordatoriosTab";
import {
  errorMessage,
  generalDraftOf,
  generalPayload,
  remindersDraftOf,
  remindersPayload,
  validateGeneral,
  validateReminders,
} from "./types";
import type { SettingsResponse, UnitSetting } from "./types";
import { useUnitForm } from "./useUnitForm";

type TabId = "negocio" | "recordatorios" | "equipo" | "datos";

const NO_UNITS: readonly UnitSetting[] = [];

function tabLabel(text: string, dirty: boolean): ReactNode {
  if (!dirty) return text;
  return (
    <>
      {text}
      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
      <span className="sr-only">, con cambios sin guardar</span>
    </>
  );
}

export function ConfiguracionPage() {
  const { hasModule, fullAccess } = useAuth();
  const [params, setParams] = useSearchParams();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [channels, setChannels] = useState<ChannelAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<number | undefined>(undefined);
  const canRemind = hasModule("recordatorios");
  const canExport = fullAccess || hasModule("informes");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSettings(await api.get<SettingsResponse>("/settings"));
    } catch (err) {
      setLoadError(errorMessage(err, "No pudimos cargar la configuración. Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Which channels the platform can send on at all. Only asked for when the daycare bought
  // reminders: the endpoint belongs to that module and would be refused otherwise.
  useEffect(() => {
    if (!canRemind) return;
    remindersApi
      .channels()
      .then(setChannels)
      .catch(() => setChannels(null));
  }, [canRemind]);

  const onSaved = useCallback((updated: UnitSetting) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            units: current.units.map((unit) =>
              unit.businessUnit === updated.businessUnit ? updated : unit,
            ),
          }
        : current,
    );
  }, []);

  // Each tab saves its own half of a unit, so a save never carries fields the admin was not
  // looking at.
  const units = settings?.units ?? NO_UNITS;
  const general = useUnitForm(units, {
    toDraft: generalDraftOf,
    validate: validateGeneral,
    toPayload: generalPayload,
    onSaved,
  });
  const reminders = useUnitForm(units, {
    toDraft: remindersDraftOf,
    validate: validateReminders,
    toPayload: remindersPayload,
    onSaved,
  });

  const unsaved = general.anyDirty || reminders.anyDirty;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const tabs: TabItem<TabId>[] = [
    { id: "negocio", label: tabLabel("Negocio", general.anyDirty), icon: Building2 },
    ...(canRemind
      ? [
          {
            id: "recordatorios" as const,
            label: tabLabel("Recordatorios", reminders.anyDirty),
            icon: Send,
          },
        ]
      : []),
    { id: "equipo", label: "Equipo", icon: Users, count: teamCount },
    ...(canExport ? [{ id: "datos" as const, label: "Datos", icon: Download }] : []),
  ];
  const requested = params.get("tab");
  const tab = tabs.find((item) => item.id === requested)?.id ?? "negocio";

  // The two tabs that read `/settings` share its loading and its failure.
  const fromSettings = (render: (loaded: SettingsResponse) => ReactNode) =>
    loading ? (
      <ListSkeleton rows={3} />
    ) : loadError || !settings ? (
      <div className="card">
        <InlineError onRetry={() => void load()}>{loadError ?? undefined}</InlineError>
      </div>
    ) : (
      render(settings)
    );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Configuración" subtitle="Los ajustes de tu negocio y de tu equipo" />
      <Tabs
        label="Configuración"
        value={tab}
        onChange={(id) => setParams(id === "negocio" ? {} : { tab: id }, { replace: true })}
        items={tabs}
      />

      {/* Every panel stays mounted, so a half-written form survives a look at another tab. */}
      <div className="max-w-3xl">
        <div role="tabpanel" aria-label="Negocio" hidden={tab !== "negocio"}>
          {fromSettings((loaded) => (
            <NegocioTab settings={loaded} form={general} />
          ))}
        </div>
        {canRemind && (
          <div role="tabpanel" aria-label="Recordatorios" hidden={tab !== "recordatorios"}>
            {fromSettings((loaded) => (
              <RecordatoriosTab settings={loaded} form={reminders} channels={channels} />
            ))}
          </div>
        )}
        <div role="tabpanel" aria-label="Equipo" hidden={tab !== "equipo"}>
          <EquipoSection onCount={setTeamCount} />
        </div>
        {canExport && (
          <div role="tabpanel" aria-label="Datos" hidden={tab !== "datos"}>
            <DatosTab />
          </div>
        )}
      </div>
    </div>
  );
}
