import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { Sidebar } from "./components/layout/Sidebar";
import { Login } from "./pages/Login";
import { frontendModules, ModuleRoute, validateFrontendModules } from "./modules/registry";

validateFrontendModules();

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Cargando sesión...</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Cargando sesión...</div>;
  }
  if (user) {
    const to = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}

function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Cargando sesión...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function ModuleRouteElement({ route }: { route: ModuleRoute }) {
  const Component = route.component;
  const element = <Component />;
  return route.roles ? <RoleRoute allowedRoles={route.roles}>{element}</RoleRoute> : element;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    {frontendModules.flatMap((module) =>
                      module.routes.map((route) => (
                        <Route key={`${module.id}:${route.path}`} path={route.path} element={<ModuleRouteElement route={route} />} />
                      )),
                    )}
                    {/* Fallback para rutas no encontradas o en desarrollo */}
                    <Route path="*" element={<div className="p-8"><h1 className="text-2xl font-bold">Próximamente</h1><p>Este módulo está en desarrollo.</p></div>} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
