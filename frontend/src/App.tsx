import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { Sidebar } from "./components/layout/Sidebar";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ClientesPage } from "./pages/clientes/ClientesPage";
import { AnimalesPage } from "./pages/animales/AnimalesPage";
import { OperacionesPage } from "./pages/operaciones/OperacionesPage";
import { DisponibilidadPage } from "./pages/disponibilidad/DisponibilidadPage";
import { TransportePage } from "./pages/transporte/TransportePage";
import { InformesPage } from "./pages/informes/InformesPage";
import { HerramientasPage } from "./pages/herramientas/HerramientasPage";
import { ConfiguracionPage } from "./pages/configuracion/ConfiguracionPage";
import { GuidePage } from "./pages/GuidePage";
import { RoomsPage } from "./pages/salas/RoomsPage";
import { RecurringPlansPage } from "./pages/planes/RecurringPlansPage";
import { FinancialPage } from "./pages/transacciones/FinancialPage";

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
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/clientes" element={<ClientesPage />} />
                    <Route path="/animales" element={<AnimalesPage />} />
                    <Route path="/operaciones" element={<OperacionesPage />} />
                    <Route path="/salas" element={<RoomsPage />} />
                    <Route path="/planes" element={<RecurringPlansPage />} />
                    <Route path="/disponibilidad" element={<DisponibilidadPage />} />
                    <Route path="/transporte" element={<TransportePage />} />
                    <Route path="/transacciones" element={<FinancialPage />} />
                    <Route path="/informes" element={<InformesPage />} />
                    <Route path="/herramientas" element={<HerramientasPage />} />
                    <Route path="/configuracion" element={<ConfiguracionPage />} />
                    <Route path="/guia" element={<GuidePage />} />
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
