import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { isProductModuleId } from "./shared/contracts";
import type { BusinessUnit, ProductModuleId, TenantRole } from "./shared/contracts";
import {
  BarChart3,
  BedDouble,
  BellRing,
  BookOpen,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FlaskConical,
  Grid3X3,
  Home,
  Package,
  PawPrint,
  Pill,
  Repeat,
  Scissors,
  Settings,
  Stethoscope,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { Dashboard } from "../pages/Dashboard";
import { ClientesPage } from "../pages/clientes/ClientesPage";
import { AnimalesPage } from "../pages/animales/AnimalesPage";
import { OperacionesPage } from "../pages/operaciones/OperacionesPage";
import { DisponibilidadPage } from "../pages/disponibilidad/DisponibilidadPage";
import { TransportePage } from "../pages/transporte/TransportePage";
import { InformesPage } from "../pages/informes/InformesPage";
import { HerramientasPage } from "../pages/herramientas/HerramientasPage";
import { ConfiguracionPage } from "../pages/configuracion/ConfiguracionPage";
import { GuidePage } from "../pages/GuidePage";
import { RoomsPage } from "../pages/salas/RoomsPage";
import { RecurringPlansPage } from "../pages/planes/RecurringPlansPage";
import { FinancialPage } from "../pages/transacciones/FinancialPage";
import { InventarioPage } from "../pages/inventario/InventarioPage";
import { AgendaPeluqueriaPage } from "../pages/peluqueria/AgendaPeluqueriaPage";
import { ControlGuarderiaPage } from "../pages/guarderia/ControlGuarderiaPage";
import { AgendaVeterinariaPage } from "../pages/veterinaria/AgendaVeterinariaPage";
import { ConsultaPage } from "../pages/veterinaria/ConsultaPage";
import { PacientesPage } from "../pages/veterinaria/PacientesPage";
import { HistoriaClinicaPage } from "../pages/veterinaria/HistoriaClinicaPage";
import { CatalogoVeterinariaPage } from "../pages/veterinaria/CatalogoVeterinariaPage";
import { FarmaciaPage } from "../pages/veterinaria/FarmaciaPage";
import { RecetaPage } from "../pages/veterinaria/RecetaPage";
import { HospitalizacionPage } from "../pages/veterinaria/HospitalizacionPage";
import { AltaPage } from "../pages/veterinaria/AltaPage";
import { LaboratorioPage } from "../pages/veterinaria/LaboratorioPage";
import { ConsentimientoPage } from "../pages/veterinaria/ConsentimientoPage";
import { RecordatoriosPage } from "../pages/veterinaria/RecordatoriosPage";
import { InformeClinicaPage } from "../pages/veterinaria/InformeClinicaPage";

export type FrontendRole = TenantRole;
export type FrontendUnit = BusinessUnit;

export interface ModuleRoute {
  path: string;
  component: ComponentType;
  roles?: FrontendRole[];
  /**
   * Product modules the daycare must have enabled for this route to work, ALL of them.
   *
   * The four frontend module ids below (`dashboard`, `guarderia`, `peluqueria`, `shared`) are
   * presentational groupings and do not line up with product modules, so entitlements are
   * declared per route. Each value is the product module owning an API the page actually
   * calls -- `/transporte` reads `/reports/transport`, for instance, so it needs `informes`
   * as well as `guarderia`.
   */
  requires?: ProductModuleId[];
  /**
   * The business unit this route belongs to, mirroring the backend module's
   * `access.businessUnits`. The backend now refuses a module that does not serve the unit the
   * caller narrowed to, so the route has to say the same thing or the page loads and then 403s.
   */
  unit?: FrontendUnit;
}

export interface ModuleNavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: FrontendRole[];
  unit?: FrontendUnit;
  requires?: ProductModuleId[];
  /** Pinned below the scrolling groups: the entries about the workspace rather than the work. */
  placement?: "footer";
}

export interface FrontendModule {
  id: string;
  label: string;
  routes: ModuleRoute[];
  navigation?: {
    label: string;
    icon: LucideIcon;
    items: ModuleNavigationItem[];
  };
  api?: unknown;
}

export const frontendModules: readonly FrontendModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    routes: [{ path: "/", component: Dashboard }],
  },
  {
    id: "guarderia",
    label: "Guardería",
    routes: [
      {
        path: "/guarderia",
        component: ControlGuarderiaPage,
        roles: ["admin", "daycare"],
        requires: ["guarderia"],
        unit: "DAYCARE",
      },
      { path: "/salas", component: RoomsPage, roles: ["admin", "daycare"], requires: ["reservas"] },
      {
        path: "/planes",
        component: RecurringPlansPage,
        roles: ["admin", "daycare"],
        requires: ["reservas"],
      },
      {
        path: "/transporte",
        component: TransportePage,
        roles: ["admin", "daycare"],
        requires: ["guarderia", "informes"],
        unit: "DAYCARE",
      },
      {
        path: "/disponibilidad",
        component: DisponibilidadPage,
        roles: ["admin", "daycare"],
        requires: ["reservas"],
      },
    ],
    navigation: {
      label: "Guardería",
      icon: Home,
      items: [
        {
          to: "/guarderia",
          label: "Control de guardería",
          icon: Home,
          roles: ["admin", "daycare"],
          unit: "DAYCARE",
          requires: ["guarderia"],
        },
        {
          to: "/salas",
          label: "Salas y cupos",
          icon: Grid3X3,
          roles: ["admin", "daycare"],
          unit: "DAYCARE",
          requires: ["reservas"],
        },
        {
          to: "/planes",
          label: "Planes recurrentes",
          icon: Repeat,
          roles: ["admin", "daycare"],
          unit: "DAYCARE",
          requires: ["reservas"],
        },
        {
          to: "/transporte",
          label: "Transporte",
          icon: Truck,
          roles: ["admin", "daycare"],
          unit: "DAYCARE",
          requires: ["guarderia", "informes"],
        },
        {
          to: "/disponibilidad",
          label: "Disponibilidad",
          icon: CalendarDays,
          roles: ["admin", "daycare"],
          unit: "DAYCARE",
          requires: ["reservas"],
        },
      ],
    },
  },
  {
    id: "peluqueria",
    label: "Peluquería",
    routes: [
      {
        path: "/peluqueria",
        component: AgendaPeluqueriaPage,
        roles: ["admin", "grooming"],
        requires: ["peluqueria"],
        unit: "GROOMING",
      },
    ],
    navigation: {
      label: "Peluquería",
      icon: Scissors,
      items: [
        {
          to: "/peluqueria",
          label: "Agenda de peluquería",
          icon: Scissors,
          roles: ["admin", "grooming"],
          unit: "GROOMING",
          requires: ["peluqueria"],
        },
      ],
    },
  },
  {
    id: "veterinaria",
    label: "Veterinaria",
    // Every clinic page also reads `/rooms` or books a reservation, so `reservas` is listed
    // even though the product catalog already makes `veterinaria` depend on it.
    routes: [
      {
        path: "/veterinaria",
        component: AgendaVeterinariaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria", "reservas"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/consultas/:id",
        component: ConsultaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/pacientes",
        component: PacientesPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/pacientes/:petId",
        component: HistoriaClinicaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria", "reservas"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/farmacia",
        component: FarmaciaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/recetas/:id",
        component: RecetaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/hospitalizacion",
        component: HospitalizacionPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/hospitalizacion/:id",
        component: AltaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/laboratorio",
        component: LaboratorioPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/consentimientos/:id",
        component: ConsentimientoPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/recordatorios",
        component: RecordatoriosPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/informe",
        component: InformeClinicaPage,
        roles: ["admin"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/catalogo",
        component: CatalogoVeterinariaPage,
        roles: ["admin"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
    ],
    navigation: {
      label: "Veterinaria",
      icon: Stethoscope,
      items: [
        {
          to: "/veterinaria",
          label: "Agenda veterinaria",
          icon: Stethoscope,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria", "reservas"],
        },
        {
          to: "/veterinaria/pacientes",
          label: "Historias clínicas",
          icon: ClipboardList,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        {
          to: "/veterinaria/hospitalizacion",
          label: "Hospitalización",
          icon: BedDouble,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        {
          to: "/veterinaria/laboratorio",
          label: "Laboratorio",
          icon: FlaskConical,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        // Stock is read through the clinic's own endpoints, so the desk works without the
        // `inventario` module; receiving stock is what needs the Inventario screen.
        {
          to: "/veterinaria/farmacia",
          label: "Farmacia",
          icon: Pill,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        {
          to: "/veterinaria/recordatorios",
          label: "Recordatorios",
          icon: BellRing,
          roles: ["admin", "veterinary"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        // The clinic's own figures, served by its module so they do not depend on `informes`.
        {
          to: "/veterinaria/informe",
          label: "Informe clínico",
          icon: BarChart3,
          roles: ["admin"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
        // The shared rooms screen, reached from the clinic's own group: its Guardería entry is
        // hidden while working in Veterinaria, and consulting rooms have to be managed somewhere.
        {
          to: "/salas",
          label: "Salas de la clínica",
          icon: Grid3X3,
          roles: ["admin"],
          unit: "VETERINARY",
          requires: ["veterinaria", "reservas"],
        },
        {
          to: "/veterinaria/catalogo",
          label: "Catálogo clínico",
          icon: Wrench,
          roles: ["admin"],
          unit: "VETERINARY",
          requires: ["veterinaria"],
        },
      ],
    },
  },
  {
    id: "shared",
    label: "Gestión",
    routes: [
      { path: "/clientes", component: ClientesPage },
      { path: "/animales", component: AnimalesPage },
      { path: "/operaciones", component: OperacionesPage, requires: ["reservas"] },
      { path: "/transacciones", component: FinancialPage, requires: ["finanzas"] },
      { path: "/inventario", component: InventarioPage, requires: ["inventario"] },
      { path: "/informes", component: InformesPage, requires: ["informes"] },
      { path: "/herramientas", component: HerramientasPage },
      { path: "/configuracion", component: ConfiguracionPage, roles: ["admin"] },
      { path: "/guia", component: GuidePage },
    ],
    navigation: {
      label: "Gestión",
      icon: Users,
      items: [
        {
          to: "/operaciones",
          label: "Operaciones",
          icon: CalendarDays,
          requires: ["reservas"],
        },
        { to: "/clientes", label: "Clientes", icon: Users },
        { to: "/animales", label: "Animales", icon: PawPrint },
        {
          to: "/transacciones",
          label: "Finanzas",
          icon: DollarSign,
          requires: ["finanzas"],
        },
        { to: "/inventario", label: "Inventario", icon: Package, requires: ["inventario"] },
        { to: "/informes", label: "Informes", icon: BarChart3, requires: ["informes"] },
        { to: "/herramientas", label: "Herramientas", icon: Wrench },
        {
          to: "/configuracion",
          label: "Configuración",
          icon: Settings,
          roles: ["admin"],
          placement: "footer",
        },
        { to: "/guia", label: "Guía de uso", icon: BookOpen, placement: "footer" },
      ],
    },
  },
];

export function validateFrontendModules(
  modules: readonly FrontendModule[] = frontendModules,
): void {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Duplicate frontend module id: ${module.id}`);
    ids.add(module.id);
    for (const route of module.routes) {
      if (paths.has(route.path)) throw new Error(`Duplicate frontend route path: ${route.path}`);
      paths.add(route.path);
      assertRequiresAreKnown(route.requires, `route ${route.path}`);
    }
    for (const item of module.navigation?.items ?? []) {
      assertRequiresAreKnown(item.requires, `nav item ${item.to}`);
    }
  }
}

/**
 * Product module ids live in two code bases and can drift. A `requires` value that is not in
 * the catalog would silently never match `enabledModules`, hiding the route from everyone, so
 * it fails at boot instead.
 */
function assertRequiresAreKnown(requires: readonly string[] | undefined, where: string): void {
  for (const id of requires ?? []) {
    if (!isProductModuleId(id)) {
      throw new Error(`Unknown product module '${id}' required by ${where}`);
    }
  }
}
