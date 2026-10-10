import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OperacionesPage } from "../pages/operaciones/OperacionesPage";
import { toOperationalEvents } from "../components/operational";
import type { Reservation } from "../components/operational/useOperacionesData";
import { api } from "../lib/api";
import type { CheckInOutRecord } from "../lib/api";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ activeBusinessUnit: "DAYCARE", can: () => true, hasModule: () => true }),
}));

const reservation = (over: Partial<Reservation>): Reservation => ({
  id: "r1",
  businessUnit: "DAYCARE",
  clientId: "c1",
  client: { id: "c1", firstName: "Ana", lastName: "Paz" },
  pets: [{ id: "rp1", pet: { id: "p1", name: "Luna" } }],
  service: "GUARDERIA",
  status: "CONFIRMADA",
  needsTransport: false,
  ...over,
});

const walkIn = (over: Partial<CheckInOutRecord>): CheckInOutRecord => ({
  id: "w1",
  petId: "p2",
  petName: "Rocky",
  clientId: "c2",
  clientName: "Leo Ríos",
  roomId: "room1",
  createdAt: "2026-10-05T15:00:00.000Z",
  status: "PENDING",
  businessUnit: "DAYCARE",
  isActive: true,
  ...over,
});

describe("toOperationalEvents", () => {
  it("leaves cancelled reservations out and maps the rest to three states", () => {
    const events = toOperationalEvents(
      [
        reservation({ id: "a", status: "CANCELADA" }),
        reservation({ id: "b", status: "CONFIRMADA" }),
        reservation({ id: "c", status: "EN_PROCESO" }),
        reservation({ id: "d", status: "COMPLETADA" }),
      ],
      [walkIn({ checkInTime: "2026-10-05T15:00:00.000Z" })],
    );
    expect(Object.fromEntries(events.map((e) => [e.originalId, e.status]))).toEqual({
      b: "PENDING",
      c: "CHECKED_IN",
      d: "CHECKED_OUT",
      w1: "CHECKED_IN",
    });
  });

  it("takes a reservation's real times from its latest attendance record", () => {
    const [event] = toOperationalEvents(
      [reservation({ id: "b", status: "ACTIVA" })],
      [
        walkIn({ id: "old", reservationId: "b", checkInTime: "2026-10-01T10:00:00.000Z" }),
        walkIn({ id: "new", reservationId: "b", checkInTime: "2026-10-02T10:00:00.000Z" }),
      ],
    );
    expect(event.actualCheckIn).toBe("2026-10-02T10:00:00.000Z");
  });
});

describe("OperacionesPage", () => {
  const get = vi.spyOn(api, "get");
  // 20:00 on the 15th of this month, in the browser's own timezone.
  const evening = new Date(new Date().getFullYear(), new Date().getMonth(), 15, 20, 0);

  beforeEach(() => {
    get.mockReset();
    get.mockImplementation(async (path: string) => {
      if (path.startsWith("/reservations")) {
        return [reservation({ checkIn: evening.toISOString() })];
      }
      return { data: [], pagination: { total: 0, skip: 0, take: 200 } };
    });
  });

  it("calls a walk-in 'Sin reserva' and asks only for the period on screen", async () => {
    render(
      <MemoryRouter>
        <OperacionesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: /Sin reserva/ })).toBeInTheDocument();
    expect(screen.queryByText(/ad-?hoc/i)).not.toBeInTheDocument();
    const paths = get.mock.calls.map(([path]) => path);
    expect(paths.every((p) => p.includes("from=") && p.includes("to="))).toBe(true);
  });

  it("puts an evening reservation on its own local day", async () => {
    render(
      <MemoryRouter>
        <OperacionesPage />
      </MemoryRouter>,
    );
    const card = await screen.findByTitle("Ana Paz - Luna");
    // The day cell holds the day number, then the count, then the cards.
    const cell = card.parentElement!.parentElement!;
    expect(cell.querySelector("span")).toHaveTextContent(/^15$/);
  });
});
