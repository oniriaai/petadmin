import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoomsPage } from "../pages/salas/RoomsPage";
import { api } from "../lib/api";

// An admin working across every unit: no active unit, so no `X-Business-Unit` header.
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ activeBusinessUnit: null, can: () => true }),
}));

const get = vi.spyOn(api, "get");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoomsPage />
    </MemoryRouter>,
  );
}

describe("RoomsPage unit scope", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue([]);
  });

  it("asks for daycare rooms and reservations when no unit is active", async () => {
    renderAt("/salas");
    await screen.findByText("Resumen del día");
    const paths = get.mock.calls.map(([path]) => path);
    expect(paths.find((p) => p.startsWith("/rooms"))).toContain("businessUnit=DAYCARE");
    expect(paths.find((p) => p.startsWith("/reservations"))).toContain("businessUnit=DAYCARE");
  });

  it("asks for clinic rooms under the clinic's path", async () => {
    renderAt("/veterinaria/salas");
    await screen.findByText("Resumen del día");
    expect(get.mock.calls.every(([path]) => path.includes("businessUnit=VETERINARY"))).toBe(true);
  });

  it("offers only the unit's room types", async () => {
    renderAt("/salas");
    fireEvent.click(await screen.findByRole("button", { name: /Nueva sala/ }));
    expect(screen.getByRole("option", { name: "Guardería" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Consultorio" })).not.toBeInTheDocument();
  });
});
