import { useCallback } from "react";
import { matchPath } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { frontendModules } from "./registry";
import type { ModuleRoute } from "./registry";

/** The registry route a pathname resolves to, parameters included. */
export function findRoute(pathname: string): ModuleRoute | undefined {
  for (const module of frontendModules) {
    for (const route of module.routes) {
      if (matchPath({ path: route.path, end: true }, pathname)) return route;
    }
  }
  return undefined;
}

/**
 * Whether a link to `path` would open the page or a "not available" notice.
 *
 * The same four rules as `GuardedRoute` (role, unit, entitlement, permission), for a page that links to
 * another section from its own content: a link the guard would refuse is a dead end, so it is
 * not offered. The sidebar keeps its own filter, since its items carry unit rules routes do not.
 */
export function useCanOpen(): (path: string) => boolean {
  const { user, hasModules, canAll, fullAccess, activeBusinessUnit } = useAuth();
  return useCallback(
    (path: string) => {
      const route = findRoute(path);
      if (!route || !user) return false;
      if (route.roles && !route.roles.includes(user.role as never)) return false;
      if (!fullAccess && route.unit && activeBusinessUnit && route.unit !== activeBusinessUnit) {
        return false;
      }
      if (!fullAccess && !hasModules(route.requires)) return false;
      return canAll(route.permissions);
    },
    [user, hasModules, canAll, fullAccess, activeBusinessUnit],
  );
}
