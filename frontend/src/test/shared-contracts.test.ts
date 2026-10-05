import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSION_IDS,
  PERMISSIONS,
  togglePermission,
} from "../modules/shared/contracts";
import type { ClientWithPets, PetSummary } from "../modules/shared/contracts";
import { clientsApi, petsApi } from "../modules/shared/api";

describe("shared module contracts", () => {
  it("describes shared client and pet records", () => {
    const pet: PetSummary = { id: "pet-1", name: "Toby", species: "dog" };
    const client: ClientWithPets = {
      id: "client-1",
      firstName: "Ada",
      lastName: "Lovelace",
      pets: [pet],
    };

    expect(client.pets[0].name).toBe("Toby");
    expect(typeof clientsApi.list).toBe("function");
    expect(typeof petsApi.list).toBe("function");
  });
});

describe("permission catalog", () => {
  // Mirrors backend/src/core/tenancy/permissions.ts. A permission added there and not here is
  // one the staff screen cannot grant; this list is what makes that drift visible in review.
  it("lists the permissions the backend enforces", () => {
    expect([...PERMISSION_IDS]).toEqual([
      "finanzas.read",
      "finanzas.write",
      "inventario.read",
      "inventario.write",
      "datos.export",
      "registros.delete",
    ]);
    expect(PERMISSIONS.map((permission) => permission.id)).toEqual([...PERMISSION_IDS]);
    expect([...DEFAULT_STAFF_PERMISSIONS]).toEqual(["inventario.read"]);
  });

  it("grants the read permission along with its write", () => {
    expect(togglePermission([], "finanzas.write", true)).toEqual([
      "finanzas.read",
      "finanzas.write",
    ]);
  });

  it("withdraws the write permission along with its read", () => {
    expect(
      togglePermission(
        ["inventario.read", "inventario.write", "datos.export"],
        "inventario.read",
        false,
      ),
    ).toEqual(["datos.export"]);
  });
});
