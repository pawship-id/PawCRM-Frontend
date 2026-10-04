import { summariseRides } from "@/features/antar-jemput/board";
import {
  countFilters,
  DEFAULT_FILTERS,
  matchesFilters,
  matchesSearch,
  toGroomingRows,
  type GroomingScope,
} from "@/features/grooming/board";
import type { Booking, BookingMainService } from "@/types/api";

/**
 * Antar-Jemput's board reads Grooming's rows for its own line — 21 September
 * 2026. What is pinned: which bookings are rides, the Arah filter, the search
 * reaching passengers, and the four cards' figures.
 */

const scope: GroomingScope = {
  serviceIds: new Set(["svc-aj"]),
  lineName: "Antar-Jemput",
  includes: (booking) => Boolean(booking.tripLeg),
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
    ...over,
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260922-001",
    customerId: "cust-1",
    customerName: "Ibu Rina",
    /* A RIDE HAS NO ANIMAL OF ITS OWN (23 September 2026) — every animal it
       carries is in `passengers`, each with the size it was booked at. */
    petId: null,
    petName: null,
    status: "confirmed",
    scheduledAt: "2026-09-22T09:00:00",
    location: "in_home",
    pickupRequested: false,
    deliveryRequested: false,
    tripLeg: "pickup",
    tripAddress: null,
    passengers: [{ _id: "pet-1", name: "Bella", petSize: "opt-size-kecil" }],
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    service: service(),
    ...over,
  } as Booking;
}

describe("which bookings are rides", () => {
  it("takes the line's services, and any ride whatever its service", () => {
    const rows = toGroomingRows(
      [
        booking(),
        booking({ _id: "bk-moved", service: service({ serviceId: "svc-other", serviceType: "Lain" }) }),
        booking({
          _id: "bk-bath",
          tripLeg: null,
          service: service({ serviceId: "svc-groom", serviceType: "Grooming" }),
        }),
      ],
      scope,
    );

    expect(rows.map((row) => row.key)).toEqual(["bk-1", "bk-moved"]);
  });
});

describe("the Arah filter and the search", () => {
  const [pickup, delivery] = toGroomingRows(
    [
      booking({ passengers: [{ _id: "pet-1", name: "Bella", petSize: "opt-size-kecil" }, { _id: "pet-2", name: "Milo", petSize: "opt-size-sedang" }] }),
      booking({ _id: "bk-2", tripLeg: "delivery" }),
    ],
    scope,
  );

  it("narrows by direction, and counts as one filter", () => {
    const filters = { ...DEFAULT_FILTERS, legs: ["delivery" as const] };

    expect(matchesFilters(pickup, filters)).toBe(false);
    expect(matchesFilters(delivery, filters)).toBe(true);
    expect(countFilters(filters)).toBe(1);
  });

  it("finds a ride by an animal riding along", () => {
    expect(matchesSearch(pickup, "milo")).toBe(true);
    expect(matchesSearch(delivery, "milo")).toBe(false);
  });
});

describe("summariseRides", () => {
  it("adds up the live rides — after discount, with the discount beside it", () => {
    const rows = toGroomingRows(
      [
        booking({ netAmount: "40000.0000", passengers: [{ _id: "pet-1", name: "Bella", petSize: "opt-size-kecil" }, { _id: "pet-2", name: "Milo", petSize: "opt-size-sedang" }] }),
        booking({ _id: "bk-2", customerId: "cust-2", tripLeg: "delivery" }),
        booking({ _id: "bk-3", status: "cancelled" }),
      ],
      scope,
    );

    const summary = summariseRides(rows);

    expect(summary.bookings).toBe(2);
    expect(summary.gross).toBe("90000.0000");
    expect(summary.net).toBe("85000.0000");
    expect(summary.discount).toBe("5000.0000");
    expect(summary.averagePerRide).toBe("42500.0000");
    /* Bella and Milo in one van, plus the second customer's animal. */
    expect(summary.animals).toBe(3);
    expect(summary.customers).toBe(2);
  });

  it("counts finished rides nobody has billed", () => {
    const rows = toGroomingRows(
      [booking({ status: "completed" }), booking({ _id: "bk-2", status: "completed", pulledToInvoiceAt: "2026-09-22" })],
      scope,
    );

    expect(summariseRides(rows).unbilledCount).toBe(1);
    expect(summariseRides(rows).unbilledValue).toBe("45000.0000");
  });
});
