import { Router } from "express";
import type { PermissionId } from "../core/tenancy/permissions";
import type { BusinessUnit, UserRole } from "../middleware/auth";

/**
 * Module access metadata reuses the auth layer's unions so the legal roles and business
 * units are declared exactly once.
 */
export type BackendModuleRole = UserRole;
export type BackendBusinessUnit = BusinessUnit;

/**
 * One permission a request needs, declared beside the module rather than inside its router.
 *
 * `methods` narrows by verb: "read" is GET/HEAD, "write" is everything else, "delete" is DELETE
 * alone. `path` narrows by the path INSIDE the module (the part after `basePath`): a string is a
 * prefix on a segment boundary, a RegExp is for a shape a prefix cannot express, such as
 * "/:id but not /:id/vaccinations/:vid". A rule with neither applies to the whole module, and a
 * request needs every rule that matches it.
 */
export interface PermissionRule {
  permission: PermissionId;
  methods?: "read" | "write" | "delete";
  path?: string | RegExp;
}

export interface BackendModule {
  id: string;
  basePath: string;
  router: Router;
  description: string;
  /**
   * Mounted without `requireAuth` and without the entitlement gate. Only the auth module,
   * which is how a session is obtained in the first place, may set this.
   */
  public?: true;
  access?: {
    roles: readonly BackendModuleRole[];
    businessUnits?: readonly BackendBusinessUnit[];
  };
  /** What a tenant user must have been granted to use this module, or parts of it. */
  permissions?: readonly PermissionRule[];
}
