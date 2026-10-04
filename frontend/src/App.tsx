import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { AppShell } from "./components/layout/AppShell";
import { Login } from "./pages/Login";
import { ModuleUnavailable, NotFound } from "./pages/StatusPages";
import { frontendModules, ModuleRoute, validateFrontendModules } from "./modules/registry";
import { Spinner } from "./components/ui/Spinner";

validateFrontendModules();

/**
 * The vendor console is loaded lazily and lives outside `frontendModules`.
 *
 * This is a requirement rather than a perf nicety: bundled eagerly, every daycare user would
 * receive the console's code and, with it, a map of the whole `/platform` API surface. It is
 * not an authorization hole — the backend gate is what enforces access — but there is no reason
 * to hand it out.
 */
const PlatformApp = lazy(() => import("./pages/platform/PlatformApp"));

function Loading({ label = "Cargando sesión..." }: { label?: string }) {
  return (
    <div className="min-h-[100dvh] grid place-items-center text-muted" role="status">
      <span className="flex items-center gap-3">
        <Spinner size={18} />
        {label}
      </span>
    </div>
  );
}

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (user) {
    const to =
      (location.state as { from?: string } | null)?.from ??
      (user.role === "superadmin" ? "/platform" : "/");
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}

/** The vendor console. A daycare user is sent back to its own workspace. */
export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "superadmin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Role AND entitlement for one route.
 *
 * Two deliberate differences from the `RoleRoute` this replaces. It renders an explanation
 * instead of `Navigate`-ing to `/`, because silently bouncing someone to the dashboard reads as
 * a bug rather than as a permission boundary. And it does not fall back to treating an
 * undefined user as an admin, which the old `user?.role ?? "admin"` did.
 */
export function GuardedRoute({
  children,
  route,
}: {
  children: React.ReactNode;
  route: ModuleRoute;
}) {
  const { user, isLoading, isSessionLoading, hasModules, fullAccess, activeBusinessUnit } =
    useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  if (route.roles && !route.roles.includes(user.role as never)) {
    return <ModuleUnavailable reason="role" />;
  }

  // The backend refuses a module that does not serve the unit the caller narrowed to. Saying so
  // here, with the way out, beats letting the page mount and fill with 403s.
  if (!fullAccess && route.unit && activeBusinessUnit && route.unit !== activeBusinessUnit) {
    return <ModuleUnavailable reason="unit" unit={route.unit} />;
  }

  // A superadmin is not restricted by entitlements, matching the backend gate.
  if (!fullAccess && !hasModules(route.requires)) {
    // Until the first /auth/me answers, enabledModules is empty and everything would look
    // disabled. Wait rather than flash a wrong "not available" page.
    if (isSessionLoading) return <Loading label="Comprobando permisos..." />;
    return <ModuleUnavailable reason="module" modules={route.requires} />;
  }

  return <>{children}</>;
}

function ModuleRouteElement({ route }: { route: ModuleRoute }) {
  const Component = route.component;
  return (
    <GuardedRoute route={route}>
      <Component />
    </GuardedRoute>
  );
}

/** A superadmin that has not pinned a tenant belongs in the console, not in a daycare workspace. */
function TenantWorkspace() {
  const { user, pinnedDaycareId } = useAuth();
  if (user?.role === "superadmin" && !pinnedDaycareId) return <Navigate to="/platform" replace />;

  return (
    <AppShell>
      <Routes>
        {frontendModules.flatMap((module) =>
          module.routes.map((route) => (
            <Route
              key={`${module.id}:${route.path}`}
              path={route.path}
              element={<ModuleRouteElement route={route} />}
            />
          )),
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/platform/*"
            element={
              <SuperAdminRoute>
                <Suspense fallback={<Loading label="Cargando consola..." />}>
                  <PlatformApp />
                </Suspense>
              </SuperAdminRoute>
            }
          />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <TenantWorkspace />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
