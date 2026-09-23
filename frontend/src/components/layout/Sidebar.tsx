import { NavLink } from "react-router-dom";
import { Compass, LayoutDashboard, LogOut, PawPrint, Scissors } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { frontendModules, ModuleNavigationItem } from "../../modules/registry";
import { cls } from "../../lib/utils";

export function Sidebar() {
  const { user, logout, activeBusinessUnit, setActiveBusinessUnit } = useAuth();
  const isAdmin = user?.role === "admin";
  const effectiveUnit = activeBusinessUnit ?? (user?.businessUnit === "GLOBAL" ? null : user?.businessUnit);
  const isKinderdog = effectiveUnit === "KINDERDOG";
  const isPethijos = effectiveUnit === "PETHIJOS";
  const accentFrom = isKinderdog ? "from-amber-600" : isPethijos ? "from-violet-700" : "from-gray-800";
  const accentTo = isKinderdog ? "to-amber-800" : isPethijos ? "to-violet-900" : "to-gray-900";
  const unitLabel = activeBusinessUnit ?? (isAdmin ? "CONSOLIDADO" : user?.businessUnit);

  const shouldShowItem = (item: ModuleNavigationItem) => {
    if (item.roles && !item.roles.includes(user?.role ?? "admin")) return false;
    if (item.unit && effectiveUnit && item.unit !== effectiveUnit) return false;
    return true;
  };

  const visibleModules = frontendModules
    .map((module) => ({
      ...module,
      navigation: module.navigation && {
        ...module.navigation,
        items: module.navigation.items.filter(shouldShowItem),
      },
    }))
    .filter((module) => module.navigation && module.navigation.items.length > 0);

  return (
    <aside className="flex flex-col w-64 shrink-0 bg-gradient-to-b from-gray-900 to-gray-950 text-white h-screen sticky top-0 overflow-y-auto">
      <div className={cls("px-4 py-5 bg-gradient-to-r", accentFrom, accentTo)}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl">
            {isKinderdog ? <PawPrint size={20} /> : isPethijos ? <Scissors size={20} /> : <Compass size={20} />}
          </div>
          <div>
            <p className="text-xs text-white/60 font-medium">{unitLabel}</p>
            <h1 className="text-base font-bold leading-tight">{user?.name ?? user?.username}</h1>
          </div>
        </div>
        {isAdmin && (
          <select
            value={activeBusinessUnit ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setActiveBusinessUnit(value === "KINDERDOG" || value === "PETHIJOS" ? value : null);
            }}
            className="mt-3 w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-xs text-white outline-none"
          >
            <option value="" className="text-gray-900">Consolidado (Ambos)</option>
            <option value="KINDERDOG" className="text-gray-900">Kinderdog (Guardería)</option>
            <option value="PETHIJOS" className="text-gray-900">Pethijos (Peluquería)</option>
          </select>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-4">
        <NavLink to="/" end className={({ isActive }) => cls("sidebar-link", isActive && "active")}>
          <LayoutDashboard size={16} className="shrink-0" />
          <span>Dashboard Principal</span>
        </NavLink>

        {visibleModules.map((module) => {
          const ModuleIcon = module.navigation!.icon;
          return (
            <div key={module.id}>
              <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <ModuleIcon size={13} /> {module.navigation!.label}
              </p>
              <div className="space-y-0.5">
                {module.navigation!.items.map(({ to, label, icon: ItemIcon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => cls("sidebar-link", isActive && "active")}>
                    <ItemIcon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-white/10">
        <button onClick={logout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut size={16} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
