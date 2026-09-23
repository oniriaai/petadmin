import { Router } from "express";

export type BackendModuleRole = "admin" | "kinderdog" | "pethijos";
export type BackendBusinessUnit = "KINDERDOG" | "PETHIJOS";

export interface BackendModule {
  id: string;
  basePath: string;
  router: Router;
  description: string;
  access?: {
    roles: readonly BackendModuleRole[];
    businessUnits?: readonly BackendBusinessUnit[];
  };
}
