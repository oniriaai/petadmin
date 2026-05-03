import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, Users, PawPrint, Grid3X3,
  Truck, BarChart3, Wrench, Settings, BookOpen, LogOut, Home, Repeat, DollarSign,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";

const navItems = [
  { to: "/",              label: "Dashboard",           icon: LayoutDashboard },
  { to: "/operaciones",   label: "Operaciones",         icon: CalendarDays },
  { to: "/salas",         label: "Salas",               icon: Home },
  { to: "/planes",        label: "Planes Recurrentes",  icon: Repeat },
  { to: "/transacciones", label: "Gestión Financiera",  icon: DollarSign },
  { to: "/clientes",      label: "Perfil del Cliente",  icon: Users },
  { to: "/animales",      label: "Animales",            icon: PawPrint },
  { to: "/disponibilidad",label: "Disponibilidad",      icon: Grid3X3 },
  { to: "/transporte",    label: "Transporte",          icon: Truck },
  { to: "/informes",      label: "Informes y Gráficos", icon: BarChart3 },
  { to: "/herramientas",  label: "Herramientas",        icon: Wrench },
  { to: "/configuracion", label: "Configuración",       icon: Settings },
  { to: "/guia",          label: "Guía de Uso",         icon: BookOpen },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  const isKinderdog = user?.businessUnit === "KINDERDOG";
  const accentFrom = isKinderdog ? "from-amber-600" : "from-violet-700";
  const accentTo   = isKinderdog ? "to-amber-800"   : "to-violet-900";

  return (
    <aside className={cls("flex flex-col w-64 shrink-0 bg-gradient-to-b from-gray-900 to-gray-950 text-white h-screen sticky top-0 overflow-y-auto")}>
      <div className={cls("px-4 py-5 bg-gradient-to-r", accentFrom, accentTo)}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">🐾</div>
          <div>
            <p className="text-xs text-white/60 font-medium">{user?.businessUnit}</p>
            <h1 className="text-base font-bold leading-tight">{user?.name ?? user?.username}</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cls("sidebar-link", isActive && "active")
            }
          >
            <Icon size={16} className="shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-white/10">
        <button
          onClick={logout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <LogOut size={16} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
