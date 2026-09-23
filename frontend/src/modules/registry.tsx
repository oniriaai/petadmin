import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, CalendarDays, DollarSign, Grid3X3, Home, PawPrint,
  Repeat, Scissors, Settings, Truck, Users, Wrench,
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
import { AgendaPeluqueriaPage } from "../pages/peluqueria/AgendaPeluqueriaPage";
import { ControlGuarderiaPage } from "../pages/guarderia/ControlGuarderiaPage";

export type FrontendRole = "admin" | "kinderdog" | "pethijos";
export type FrontendUnit = "KINDERDOG" | "PETHIJOS";

export interface ModuleRoute {
  path: string;
  component: ComponentType;
  roles?: FrontendRole[];
}

export interface ModuleNavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: FrontendRole[];
  unit?: FrontendUnit;
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
      { path: "/guarderia", component: ControlGuarderiaPage, roles: ["admin", "kinderdog"] },
      { path: "/salas", component: RoomsPage, roles: ["admin", "kinderdog"] },
      { path: "/planes", component: RecurringPlansPage, roles: ["admin", "kinderdog"] },
      { path: "/transporte", component: TransportePage, roles: ["admin", "kinderdog"] },
      { path: "/disponibilidad", component: DisponibilidadPage, roles: ["admin", "kinderdog"] },
    ],
    navigation: {
      label: "Guardería",
      icon: Home,
      items: [
        { to: "/guarderia", label: "Control Guardería", icon: Home, roles: ["admin", "kinderdog"], unit: "KINDERDOG" },
        { to: "/salas", label: "Salas & Cupos", icon: Grid3X3, roles: ["admin", "kinderdog"], unit: "KINDERDOG" },
        { to: "/planes", label: "Planes Recurrentes", icon: Repeat, roles: ["admin", "kinderdog"], unit: "KINDERDOG" },
        { to: "/transporte", label: "Transporte", icon: Truck, roles: ["admin", "kinderdog"], unit: "KINDERDOG" },
        { to: "/disponibilidad", label: "Disponibilidad", icon: CalendarDays, roles: ["admin", "kinderdog"], unit: "KINDERDOG" },
      ],
    },
  },
  {
    id: "peluqueria",
    label: "Peluquería",
    routes: [{ path: "/peluqueria", component: AgendaPeluqueriaPage, roles: ["admin", "pethijos"] }],
    navigation: {
      label: "Peluquería",
      icon: Scissors,
      items: [{ to: "/peluqueria", label: "Agenda Peluquería", icon: Scissors, roles: ["admin", "pethijos"], unit: "PETHIJOS" }],
    },
  },
  {
    id: "shared",
    label: "Gestión Transversal",
    routes: [
      { path: "/clientes", component: ClientesPage },
      { path: "/animales", component: AnimalesPage },
      { path: "/operaciones", component: OperacionesPage },
      { path: "/transacciones", component: FinancialPage },
      { path: "/informes", component: InformesPage },
      { path: "/herramientas", component: HerramientasPage },
      { path: "/configuracion", component: ConfiguracionPage, roles: ["admin"] },
      { path: "/guia", component: GuidePage },
    ],
    navigation: {
      label: "Gestión Transversal",
      icon: Users,
      items: [
        { to: "/operaciones", label: "Operaciones (General)", icon: CalendarDays },
        { to: "/clientes", label: "Perfil del Cliente", icon: Users },
        { to: "/animales", label: "Animales", icon: PawPrint },
        { to: "/transacciones", label: "Gestión Financiera", icon: DollarSign },
        { to: "/informes", label: "Informes y Gráficos", icon: BarChart3 },
        { to: "/herramientas", label: "Herramientas", icon: Wrench },
        { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
        { to: "/guia", label: "Guía de Uso", icon: BookOpen },
      ],
    },
  },
];

export function validateFrontendModules(modules: readonly FrontendModule[] = frontendModules): void {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Duplicate frontend module id: ${module.id}`);
    ids.add(module.id);
    for (const route of module.routes) {
      if (paths.has(route.path)) throw new Error(`Duplicate frontend route path: ${route.path}`);
      paths.add(route.path);
    }
  }
}
