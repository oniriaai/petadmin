import { describe, expect, it } from "vitest";
import { frontendModules, validateFrontendModules } from "../modules/registry";

describe("frontend module registry", () => {
  it("contains unique module and route definitions", () => {
    expect(() => validateFrontendModules()).not.toThrow();
    expect(frontendModules.some((module) => module.id === "guarderia")).toBe(true);
    expect(frontendModules.some((module) => module.id === "peluqueria")).toBe(true);
  });

  it("rejects duplicate routes", () => {
    const [first] = frontendModules;
    expect(() =>
      validateFrontendModules([first, { ...first, id: "duplicate", routes: [...first.routes] }]),
    ).toThrow("Duplicate frontend route path");
  });
});
