import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AntarJemputBookingsTable } from "@/features/antar-jemput/components/AntarJemputBookingsTable";
import { toGroomingRows, type GroomingScope } from "@/features/grooming/board";
import type { Booking, BookingMainService } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => "/dashboard/layanan/antar-jemput",
}));

beforeEach(() => push.mockClear());

const scope: GroomingScope = {
  serviceIds: new Set(["svc-aj"]),
  lineName: "Antar-Jemput",
  includes: (one) => Boolean(one.tripLeg),
};

function service(over: Partial<BookingMainService> = {}): BookingMainService {
  return {
    serviceId: "svc-aj",
    name: "Antar-Jemput",
    serviceType: "Antar-Jemput",
    price: "45000.0000",
    durationMin: 30,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: [],
    zone: { zoneId: "z1", name: "Zona A", distanceKm: 2 },
    ...over,
  } as BookingMainService;
}

function ride(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260923-001",
    customerName: "Ibu Rina",
    /* A ride has no animal of its own (23 September 2026). */
    petId: null,
    petName: null,
    status: "confirmed",
    statusHistory: [],
    nextStatuses: [],
    scheduledAt: "2026-09-23T09:00:00",
    location: "in_home",
    pickupRequested: false,
    deliveryRequested: false,
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    groomerName: "Anto",
    totalAmount: "45000.0000",
    tripLeg: "pickup",
    passengers: [
      { _id: "pet-1", name: "Bella", petSize: "small" },
      { _id: "pet-2", name: "Milo", petSize: "medium" },
    ],
    tripOrigin: { address: "Jl. Mawar 12", lat: -7.2395, lng: 112.7521 },
    tripDestination: { address: "Cabang Barat", lat: -7.2575, lng: 112.7521 },
    service: service(),
    ...over,
  } as Booking;
}

function draw(bookings: Booking[]) {
  renderWithAuth(
    <AntarJemputBookingsTable
      rows={toGroomingRows(bookings, scope)}
      loading={false}
      onChanged={jest.fn()}
      emptyMessage="kosong"
    />,
  );
}

/**
 * Layanan › Antar-Jemput › Booking — the table of `buloo-antar-jemput-v5.html`.
 *
 * WHAT IS PINNED HERE is what keeps it from drifting back into Grooming's
 * table, which it matched column for column until 23 September 2026: its
 * columns, and that a row OPENS THE BOOKING rather than unfolding under itself.
 */
describe("AntarJemputBookingsTable", () => {
  it("draws the mockup's columns, and no Faktur column", () => {
    draw([ride()]);

    const headers = screen.getAllByRole("columnheader").map((one) => one.textContent?.trim());

    expect(headers).toEqual([
      "Booking",
      "Pelanggan & Hewan",
      "Arah",
      "Jam",
      "Driver",
      "Status",
      "Nilai",
    ]);
  });

  /*
    THE BILL IS A BADGE UNDER THE NUMBER, not a column of repeated words — and
    it says nothing at all while nothing is owed.
  */
  it("puts what is owed under the booking number, and only when something is", () => {
    draw([ride({ status: "completed" })]);

    const row = screen.getByRole("link", { name: /BK-260923-001/ }).closest("td");
    expect(within(row as HTMLElement).getByText("Belum ditagih")).toBeInTheDocument();
  });

  it("says nothing about the bill on a ride that is not due yet", () => {
    draw([ride()]);

    expect(screen.queryByText("Belum ditagih")).toBeNull();
    expect(screen.queryByText("Difakturkan")).toBeNull();
  });

  it("names the other direction of the visit under the number", () => {
    draw([
      ride({
        trips: [
          {
            _id: "bk-2",
            bookingNumber: "BK-260923-002",
            tripLeg: "delivery",
            status: "confirmed",
            scheduledAt: "2026-09-23T13:00:00",
          },
        ],
      }),
    ]);

    expect(screen.getByText(/Antar Jemput · BK-260923-002/)).toBeInTheDocument();
  });

  /*
    ARAH IS THE DIRECTION AND NOTHING ELSE (23 September 2026, on request). A
    ride has TWO addresses now and neither belongs in a column; the zone and the
    add-ons are under Rincian, one click away.
  */
  it("puts only the direction in Arah — no zone, no address, no add-on tags", () => {
    draw([ride()]);

    const arah = screen.getByText("Jemput");
    expect(arah).toBeInTheDocument();
    expect(screen.queryByText(/Zona A/)).toBeNull();
    expect(screen.queryByText("Jl. Mawar 12")).toBeNull();
    expect(screen.queryByText("Cabang Barat")).toBeNull();
  });

  it("names every animal in the van beside the customer", () => {
    draw([ride()]);

    expect(screen.getByText(/Bella, Milo · 2 hewan/)).toBeInTheDocument();
  });

  /*
    A ROW OPENS THE BOOKING (23 September 2026, on request) — Grooming's board
    unfolds a drawer under the row, and this one does not.
  */
  it("opens the booking's page on a row click, and unfolds nothing", async () => {
    draw([ride()]);

    await userEvent.click(screen.getByText("Ibu Rina"));

    expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1");
    expect(screen.queryByRole("button", { name: /rincian/i })).toBeNull();
  });

  /* A driver's note is read on the booking's page, not scanned down a list. */
  it("keeps the internal note off the table entirely", () => {
    draw([ride({ internalNotes: "Pagar hijau, telepon dulu" })]);

    expect(screen.queryByText("Pagar hijau, telepon dulu")).toBeNull();
  });
});
