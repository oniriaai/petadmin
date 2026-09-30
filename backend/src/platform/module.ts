import { Router } from "express";
import type { BusinessUnit, UserRole } from "../middleware/auth";

/**
 * Module access metadata reuses the auth layer's unions so the legal roles and business
 * units are declared exactly once.
 */
export type BackendModuleRole = UserRole;
export type BackendBusinessUnit = BusinessUnit;

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
}
