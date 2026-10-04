import { Link } from "react-router-dom";
import { ArrowLeftRight, Lock, PackageX, SearchX } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { businessUnitLabel } from "../modules/shared/contracts";
import type { BusinessUnit, ProductModuleId } from "../modules/shared/contracts";

const MODULE_LABELS: Record<ProductModuleId, string> = {
  nucleo: "Núcleo",
  reservas: "Reservas y Agenda",
  guarderia: "Guardería",
  peluqueria: "Peluquería",
  veterinaria: "Veterinaria",
  finanzas: "Gestión Financiera",
  inventario: "Inventario",
  informes: "Informes y Exportación",
  cumplimiento: "Contratos y Alertas",
};

function Shell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 sm:p-10 max-w-xl">
      <div className="card p-6 sm:p-8">
        <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-500 grid place-items-center mb-4">
          {icon}
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <div className="text-sm text-gray-600 space-y-3">{children}</div>
        <Link to="/" className="btn btn-secondary mt-6 inline-flex">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

/**
 * Shown when a route is blocked, instead of redirecting to the dashboard.
 *
 * A silent redirect is indistinguishable from a broken link: the person clicks something and
 * lands somewhere else with no explanation. Saying which module is missing is also what lets
 * them ask for it by name.
 */
export function ModuleUnavailable({
  reason,
  modules,
  unit,
}: {
  reason: "module" | "role" | "unit";
  modules?: readonly ProductModuleId[];
  unit?: BusinessUnit;
}) {
  if (reason === "unit") return <WrongUnit unit={unit} />;

  if (reason === "role") {
    return (
      <Shell icon={<Lock size={22} />} title="No tienes acceso a esta sección">
        <p>
          Tu rol no permite entrar aquí. Si necesitas acceso, pídeselo a un administrador de tu
          guardería.
        </p>
      </Shell>
    );
  }

  const missing = (modules ?? []).map((id) => MODULE_LABELS[id] ?? id);
  return (
    <Shell icon={<PackageX size={22} />} title="Módulo no disponible">
      <p>
        {missing.length > 0
          ? `Esta sección necesita ${missing.length > 1 ? "los módulos" : "el módulo"} ${missing.join(" y ")}, que no está${missing.length > 1 ? "n" : ""} habilitado${missing.length > 1 ? "s" : ""} para tu guardería.`
          : "Esta sección no está habilitada para tu guardería."}
      </p>
      <p className="text-gray-500">Contacta con el proveedor del sistema para activarlo.</p>
    </Shell>
  );
}

/**
 * The page belongs to a unit other than the one selected. Unlike the other two states this is
 * self-service, so it offers the fix rather than only naming the problem.
 */
function WrongUnit({ unit }: { unit?: BusinessUnit }) {
  const { setActiveBusinessUnit } = useAuth();
  const label = unit ? businessUnitLabel(unit) : "otra unidad";

  return (
    <Shell icon={<ArrowLeftRight size={22} />} title={`Esta sección es de ${label}`}>
      <p>
        Estás trabajando en otra unidad de negocio. Cambia a {label} para verla, o vuelve al inicio.
      </p>
      {unit && (
        <button className="btn btn-primary mt-1" onClick={() => setActiveBusinessUnit(unit)}>
          Cambiar a {label}
        </button>
      )}
    </Shell>
  );
}

export function NotFound() {
  return (
    <Shell icon={<SearchX size={22} />} title="Página no encontrada">
      <p>La dirección que abriste no corresponde a ninguna sección del sistema.</p>
    </Shell>
  );
}
