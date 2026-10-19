import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AntarJemputBookingsScreen } from "@/features/antar-jemput/components/AntarJemputBookingsScreen";
import { toGroomingRows, type GroomingScope } from "@/features/grooming/board";
import { GroomingBookingsScreen } from "@/features/grooming/components/GroomingBookingsScreen";
import type { Booking, BookingMainService } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service", () => ({
  bookingService: { availability: jest.fn().mockResolvedValue([]) },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/layanan",
}));

/* The scope row and the tabs fetch branches and read the route — not under test. */
jest.mock("@/features/grooming/components/GroomingPeriodBar", () => ({
  GroomingPeriodBar: () => null,
}));
jest.mock("@/features/grooming/components/GroomingModuleHeader", () => ({
  GroomingModuleHeader: () => null,
}));

jest.mock("@/features/grooming/hooks/useGroomingCatalog", () => ({
  useGroomingCatalog: () => ({ services: [], loading: false }),
}));
jest.mock("@/features/grooming/hooks/useFirstVisits", () => ({
  useFirstVisits: () => ({ firstBookingIds: new Set(), loading: false, failed: false }),
}));

const scope: GroomingScope = {
  serviceIds: new Set(["svc"]),
  lineName: "Grooming",
  includes: () => true,
};

function booking(id: string, number: string | null, price: string, at: string): Booking {
  const one: Partial<Booking> = {
    _id: id,
    bookingNumber: number,
    customerName: `Pelanggan ${id}`,
    petId: "pet",
    petName: `Hewan ${id}`,
    status: "confirmed",
    statusHistory: [],
    nextStatuses: [],
    scheduledAt: at,
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    tripLeg: "pickup",
    passengers: [],
    service: {
      serviceId: "svc",
      name: "Layanan",
      serviceType: "Grooming",
      price,
      durationMin: 30,
      status: "pending",
      statusHistory: [],
      startedAt: null,
      finishedAt: null,
      sessions: [],
      addons: [],
    } as BookingMainService,
  };
  return one as Booking;
}

/*
  Schedule order: B (BK-…-010, 50.000), A (BK-…-002, 300.000), C (draft, 90.000).
  By number: A, B, then the draft. By Nilai: A, C, B.
*/
const rows = toGroomingRows(
  [
    booking("A", "BK-261020-002", "300000.0000", "2026-10-20T11:00:00"),
    booking("B", "BK-261020-010", "50000.0000", "2026-10-20T09:00:00"),
    booking("C", null, "90000.0000", "2026-10-20T13:00:00"),
  ],
  scope,
);

jest.mock("@/features/grooming/hooks/useGroomingBoard", () => ({
  MAX_BOOKING_PAGES: 10,
  useGroomingBoard: () => ({
    periodRows: rows,
    todayRows: [],
    loading: false,
    todayLoading: false,
    error: null,
    todayError: false,
    truncated: false,
    replaceBooking: jest.fn(),
  }),
}));

/* Settles the toolbar's crew fetch inside act, so React does not warn. */
async function draw(Screen: () => React.JSX.Element) {
  await act(async () => {
    renderWithAuth(<Screen />);
  });
}

function order(): string[] {
  const [, body] = screen.getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getByText(/^Pelanggan /).textContent!.replace("Pelanggan ", ""));
}

/**
 * Both booking boards, sorted from their Booking and Nilai headers (BO,
 * 20 October 2026) over the whole loaded period. Urutkan left the Filter
 * panel, and its Reset no longer touches the ordering.
 */
describe.each([
  ["Grooming", GroomingBookingsScreen],
  ["Antar-Jemput", AntarJemputBookingsScreen],
])("%s booking board — header sorting", (_name, Screen) => {
  it("starts in schedule order and sorts from the two headers", async () => {
    await draw(Screen);

    expect(order()).toEqual(["B", "A", "C"]);

    await userEvent.click(screen.getByRole("button", { name: "Booking" }));
    expect(order()).toEqual(["A", "B", "C"]);
    await userEvent.click(screen.getByRole("button", { name: "Booking" }));
    expect(order()).toEqual(["B", "A", "C"]);

    await userEvent.click(screen.getByRole("button", { name: "Nilai" }));
    expect(order()).toEqual(["A", "C", "B"]);
  });

  it("has no Urutkan in the Filter panel, and Reset keeps the ordering", async () => {
    await draw(Screen);

    await userEvent.click(screen.getByRole("button", { name: "Nilai" }));
    expect(order()).toEqual(["A", "C", "B"]);

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByText("Urutkan")).toBeNull();

    await userEvent.click(within(panel).getByRole("button", { name: /reset/i }));

    expect(order()).toEqual(["A", "C", "B"]);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(/^Filter$/);
  });
});

it("drops the Antar-Jemput board's click-the-row footnote", async () => {
  await draw(AntarJemputBookingsScreen);

  expect(screen.queryByText(/Klik baris untuk membuka halaman booking/)).toBeNull();
});
