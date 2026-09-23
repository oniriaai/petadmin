import { describe, expect, it } from "vitest";
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
