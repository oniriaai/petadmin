import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { isPermissionId, isProductModuleId } from "./shared/contracts";
import type { BusinessUnit, PermissionId, ProductModuleId, TenantRole } from "./shared/contracts";
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
  Send,
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
import { AvisosPage } from "../pages/recordatorios/AvisosPage";

export type FrontendRole = TenantRole;
export type FrontendUnit = BusinessUnit;

export interface ModuleRoute {
  path: string;
  /** What the browser tab says while the page is open, in the user's language. */
  title: string;
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
   * Permissions the user must hold to open the page, ALL of them. Like `requires`, derived from
   * the endpoints the page cannot work without: a page that only hides a button for lack of a
   * permission gates that button with `can()` instead.
   */
  permissions?: PermissionId[];
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
  permissions?: PermissionId[];
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
    routes: [{ path: "/", title: "Inicio", component: Dashboard }],
  },
  {
    id: "guarderia",
    label: "Guardería",
    routes: [
      {
        path: "/guarderia",
        title: "Control de guardería",
        component: ControlGuarderiaPage,
        roles: ["admin", "daycare"],
        requires: ["guarderia"],
        unit: "DAYCARE",
      },
      {
        path: "/salas",
        title: "Salas y cupos",
        component: RoomsPage,
        roles: ["admin", "daycare"],
        requires: ["reservas"],
      },
      {
        path: "/planes",
        title: "Planes recurrentes",
        component: RecurringPlansPage,
        roles: ["admin", "daycare"],
        requires: ["reservas"],
      },
      {
        path: "/transporte",
        title: "Transporte",
        component: TransportePage,
        roles: ["admin", "daycare"],
        requires: ["guarderia", "informes"],
        unit: "DAYCARE",
      },
      {
        path: "/disponibilidad",
        title: "Disponibilidad",
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
        title: "Agenda de peluquería",
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
        title: "Agenda veterinaria",
        component: AgendaVeterinariaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria", "reservas"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/consultas/:id",
        title: "Consulta",
        component: ConsultaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/pacientes",
        title: "Historias clínicas",
        component: PacientesPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/pacientes/:petId",
        title: "Historia clínica",
        component: HistoriaClinicaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria", "reservas"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/farmacia",
        title: "Farmacia",
        component: FarmaciaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/recetas/:id",
        title: "Receta",
        component: RecetaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/hospitalizacion",
        title: "Hospitalización",
        component: HospitalizacionPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/hospitalizacion/:id",
        title: "Alta hospitalaria",
        component: AltaPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/laboratorio",
        title: "Laboratorio",
        component: LaboratorioPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/consentimientos/:id",
        title: "Consentimiento",
        component: ConsentimientoPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/recordatorios",
        title: "Recordatorios",
        component: RecordatoriosPage,
        roles: ["admin", "veterinary"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/informe",
        title: "Informe clínico",
        component: InformeClinicaPage,
        roles: ["admin"],
        requires: ["veterinaria"],
        unit: "VETERINARY",
      },
      {
        path: "/veterinaria/catalogo",
        title: "Catálogo clínico",
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
      { path: "/clientes", title: "Clientes", component: ClientesPage },
      { path: "/animales", title: "Animales", component: AnimalesPage },
      {
        path: "/operaciones",
        title: "Operaciones",
        component: OperacionesPage,
        requires: ["reservas"],
      },
      {
        path: "/transacciones",
        title: "Finanzas",
        component: FinancialPage,
        requires: ["finanzas"],
        permissions: ["finanzas.read"],
      },
      {
        path: "/inventario",
        title: "Inventario",
        component: InventarioPage,
        requires: ["inventario"],
        permissions: ["inventario.read"],
      },
      // Every figure on the page is financial (`/reports/incomes`, `/expenses`, `/kpis`).
      {
        path: "/informes",
        title: "Informes",
        component: InformesPage,
        requires: ["informes"],
        permissions: ["finanzas.read"],
      },
      // Every unit has something to remind a tutor about, so this is not tied to one. Named
      // apart from the clinic's "Recordatorios", which is its list of what to chase.
      {
        path: "/avisos",
        title: "Avisos a tutores",
        component: AvisosPage,
        requires: ["recordatorios"],
      },
      { path: "/herramientas", title: "Herramientas", component: HerramientasPage },
      {
        path: "/configuracion",
        title: "Configuración",
        component: ConfiguracionPage,
        roles: ["admin"],
      },
      { path: "/guia", title: "Guía de uso", component: GuidePage },
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
          permissions: ["finanzas.read"],
        },
        {
          to: "/inventario",
          label: "Inventario",
          icon: Package,
          requires: ["inventario"],
          permissions: ["inventario.read"],
        },
        {
          to: "/informes",
          label: "Informes",
          icon: BarChart3,
          requires: ["informes"],
          permissions: ["finanzas.read"],
        },
        { to: "/avisos", label: "Avisos a tutores", icon: Send, requires: ["recordatorios"] },
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
      assertPermissionsAreKnown(route.permissions, `route ${route.path}`);
    }
    for (const item of module.navigation?.items ?? []) {
      assertRequiresAreKnown(item.requires, `nav item ${item.to}`);
      assertPermissionsAreKnown(item.permissions, `nav item ${item.to}`);
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

/** The same drift, for permissions: an unknown id would hide the route from everyone but admins. */
function assertPermissionsAreKnown(
  permissions: readonly string[] | undefined,
  where: string,
): void {
  for (const id of permissions ?? []) {
    if (!isPermissionId(id)) {
      throw new Error(`Unknown permission '${id}' on ${where}`);
    }
  }
}
