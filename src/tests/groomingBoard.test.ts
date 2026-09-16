import {
  billingOf,
  countFilters,
  DEFAULT_FILTERS,
  formatMoneyShort,
  isGroomingService,
  matchesFilters,
  matchesLens,
  periodRange,
  pickGroomingLine,
  sortRows,
  summariseDay,
  summarisePeriod,
  toGroomingRows,
  type GroomingScope,
} from "@/features/grooming/board";
import type {
  Booking,
  BookingMainService,
  BookingSession,
} from "@/types/api";

/**
 * The Grooming board computes every card from the rows it draws — so the
 * narrowing and the sums are the part worth pinning down. One row is one
 * booking: one animal, one main service.
 */

const scope: GroomingScope = {
  serviceIds: new Set(["svc-groom"]),
  lineName: "Grooming",
};

function session(over: Partial<BookingSession> = {}): BookingSession {
  return {
    sessionId: "ses-1",
    sessionName: "Mandi",
    groomers: [],
    status: "pending",
    startedAt: null,
    finishedAt: null,
    notesSession: null,
    notesInternalSession: null,
    media: [],
    commissionWeight: null,
    ...over,
  };
}

function service(over: Partial<BookingMainService> = {}): BookingMainService {
  return {
    serviceId: "svc-groom",
    name: "Basic Grooming",
    serviceType: "Grooming",
    price: "150000.0000",
    durationMin: 60,
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
    bookingNumber: "BK-260913-001",
    customerName: "Rina",
    petId: "pet-1",
    petName: "Bella",
    status: "confirmed",
    scheduledAt: "2026-09-13T09:00:00",
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    service: service(),
    ...over,
  } as Booking;
}

describe("pickGroomingLine", () => {
  it("prefers the line named exactly Grooming over one that only contains it", () => {
    const lines = [
      { _id: "a", name: "Grooming Keliling", color: "#000000" },
      { _id: "b", name: " grooming ", color: "#000000" },
    ];

    expect(pickGroomingLine(lines)?._id).toBe("b");
    expect(pickGroomingLine([{ _id: "c", name: "Hotel", color: "#000000" }])).toBeNull();
  });
});

describe("isGroomingService", () => {
  it("falls back to the snapshotted line name when the id is not in the catalogue", () => {
    const blind: GroomingScope = { serviceIds: new Set(), lineName: "Grooming" };

    expect(isGroomingService({ serviceId: "gone", serviceType: "grooming " }, blind)).toBe(true);
    expect(isGroomingService({ serviceId: "gone", serviceType: "Hotel" }, blind)).toBe(false);
    expect(isGroomingService({ serviceId: "gone", serviceType: null }, blind)).toBe(false);
  });
});

describe("periodRange", () => {
  // 13 September 2026 is a Sunday.
  const sunday = new Date(2026, 8, 13, 15, 30);

  it("runs a week Monday to Sunday", () => {
    expect(periodRange("week", sunday)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("covers the whole calendar month and the single day", () => {
    expect(periodRange("month", sunday)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("today", sunday)).toEqual({ from: "2026-09-13", to: "2026-09-13" });
  });
});

describe("toGroomingRows", () => {
  it("keeps one row per grooming booking, with its add-ons in the value", () => {
    const rows = toGroomingRows(
      [
        booking({
          service: service({
            addons: [
              {
                itemId: "add-1",
                serviceId: "svc-kutu",
                name: "Obat Kutu",
                price: "35000.0000",
                durationMin: 15,
              },
            ],
          }),
        }),
        /* The same visit's other booking — a night in the hotel, not a row. */
        booking({
          _id: "bk-2",
          petId: "pet-2",
          petName: "Milo",
          service: service({
            serviceId: "svc-hotel",
            name: "Hotel 1 malam",
            serviceType: "Hotel",
            price: "200000.0000",
          }),
        }),
      ],
      scope,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("bk-1");
    expect(rows[0].booking.petName).toBe("Bella");
    expect(rows[0].service.name).toBe("Basic Grooming");
    expect(rows[0].value).toBe("185000.0000");
    expect(rows[0].durationMin).toBe(75);
  });

  it("lists each groomer once across turns and counts finished turns", () => {
    const sinta = { _id: "u-sinta", name: "Sinta", offReason: null };
    const [row] = toGroomingRows(
      [
        booking({
          service: service({
            sessions: [
              session({ sessionId: "s1", groomers: [sinta], status: "done" }),
              session({
                sessionId: "s2",
                groomers: [sinta, { _id: "u-dedi", name: "Dedi", offReason: null }],
              }),
            ],
          }),
        }),
      ],
      scope,
    );

    expect(row.groomers.map((who) => who.name)).toEqual(["Sinta", "Dedi"]);
    expect(row.sessionsDone).toBe(1);
    expect(row.sessions).toHaveLength(2);
  });
});

describe("billingOf", () => {
  it("calls finished, unclaimed work unbilled — and nothing else", () => {
    expect(billingOf(booking({ status: "completed" }))).toBe("unbilled");
    expect(billingOf(booking({ status: "return_to_pawrents" }))).toBe("unbilled");
    expect(billingOf(booking({ status: "in_progress" }))).toBe("not_due");
    expect(billingOf(booking({ status: "cancelled" }))).toBe("not_due");
  });

  it("tells an open basket from a settled sale and an invoice", () => {
    const claimed = { status: "completed" as const, pulledToCartAt: "2026-09-13T10:00:00Z" };

    expect(billingOf(booking(claimed))).toBe("in_cart");
    expect(billingOf(booking({ ...claimed, posTransactionId: "pos-1" }))).toBe("paid");
    expect(
      billingOf(booking({ status: "completed", pulledToInvoiceAt: "2026-09-13T10:00:00Z" })),
    ).toBe("invoiced");
  });
});

describe("summarisePeriod", () => {
  it("leaves cancelled bookings out of the value and finds the oldest unbilled day", () => {
    const rows = toGroomingRows(
      [
        booking({
          _id: "bk-1",
          scheduledAt: "2026-09-07T09:00:00",
          status: "completed",
        }),
        booking({
          _id: "bk-2",
          scheduledAt: "2026-09-12T09:00:00",
          status: "cancelled",
        }),
        booking({
          _id: "bk-3",
          scheduledAt: "2026-09-12T09:00:00",
          status: "confirmed",
          service: service({
            price: "100000.0000",
            addons: [
              {
                itemId: "a",
                serviceId: "svc-spa",
                name: "Spa",
                price: "50000.0000",
                durationMin: null,
              },
            ],
          }),
        }),
      ],
      scope,
    );

    const summary = summarisePeriod(rows, new Date(2026, 8, 13));

    expect(summary.bookings).toBe(2);
    expect(summary.value).toBe("300000.0000");
    expect(summary.averagePerAnimal).toBe("150000.0000");
    expect(summary.addonRate).toBe(50);
    expect(summary.unbilledCount).toBe(1);
    expect(summary.unbilledValue).toBe("150000.0000");
    expect(summary.oldestUnbilledDays).toBe(6);
  });

  it("answers null rather than zero when there is nothing to average", () => {
    const summary = summarisePeriod([]);

    expect(summary.averagePerAnimal).toBeNull();
    expect(summary.addonRate).toBeNull();
    expect(summary.oldestUnbilledDays).toBeNull();
  });
});

describe("summariseDay", () => {
  it("keeps Draft and Requested out of the queue", () => {
    const statuses = ["in_progress", "arrived", "confirmed", "draft", "requested", "completed"] as const;
    const rows = toGroomingRows(
      statuses.map((status, index) => booking({ _id: `bk-${index}`, status })),
      scope,
    );

    expect(summariseDay(rows)).toEqual({
      working: 1,
      workingValue: "150000.0000",
      queued: 2,
      finished: 1,
      unconfirmed: 2,
    });
  });
});

describe("filters, lens and sort", () => {
  const rows = toGroomingRows(
    [
      booking({
        _id: "late",
        bookingNumber: "BK-2",
        scheduledAt: "2026-09-13T14:00:00",
        location: "in_home",
        status: "in_progress",
      }),
      booking({
        _id: "early",
        bookingNumber: "BK-1",
        scheduledAt: "2026-09-13T08:00:00",
        service: service({ serviceId: "svc-groom-plus", price: "400000.0000" }),
      }),
    ],
    { ...scope, serviceIds: new Set(["svc-groom", "svc-groom-plus"]) },
  );

  it("never counts the sort towards Filter (n)", () => {
    expect(countFilters({ ...DEFAULT_FILTERS, sort: "value_desc" })).toBe(0);
    expect(countFilters({ ...DEFAULT_FILTERS, locations: ["in_home"] })).toBe(1);
  });

  it("narrows by place, by service and by the working lens", () => {
    const home = rows.filter((row) =>
      matchesFilters(row, { ...DEFAULT_FILTERS, locations: ["in_home"] }),
    );
    const plus = rows.filter((row) =>
      matchesFilters(row, { ...DEFAULT_FILTERS, serviceIds: ["svc-groom-plus"] }),
    );

    expect(home.map((row) => row.key)).toEqual(["late"]);
    expect(plus.map((row) => row.key)).toEqual(["early"]);
    expect(rows.filter((row) => matchesLens(row, "working")).map((row) => row.key)).toEqual([
      "late",
    ]);
  });

  it("orders by schedule either way, and by value", () => {
    expect(sortRows(rows, "schedule_asc").map((row) => row.key)).toEqual(["early", "late"]);
    expect(sortRows(rows, "schedule_desc").map((row) => row.key)).toEqual(["late", "early"]);
    expect(sortRows(rows, "value_desc").map((row) => row.key)).toEqual(["early", "late"]);
  });
});

describe("formatMoneyShort", () => {
  it("reads rupiah the way a card has room for", () => {
    expect(formatMoneyShort("3145000.0000")).toBe("Rp 3,1 jt");
    expect(formatMoneyShort("453000")).toBe("Rp 453 rb");
    expect(formatMoneyShort("999999")).toBe("Rp 1 jt");
    expect(formatMoneyShort("500")).toBe("Rp 500");
    expect(formatMoneyShort(null)).toBe("—");
  });
});
