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
  BookingPet,
  BookingPetService,
  BookingSession,
} from "@/types/api";

/**
 * The Grooming board computes every card from the rows it draws — so the
 * narrowing and the sums are the part worth pinning down.
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

function service(over: Partial<BookingPetService> = {}): BookingPetService {
  return {
    itemId: "item-1",
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

function pet(over: Partial<BookingPet> = {}): BookingPet {
  return {
    petItemId: "pi-1",
    petId: "pet-1",
    petName: "Bella",
    petSize: "medium",
    status: "confirmed",
    statusHistory: [],
    nextStatuses: [],
    cancelReason: null,
    internalNotes: null,
    customerNotes: null,
    notes: null,
    belongings: [],
    media: [],
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    services: [service()],
    ...over,
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260913-001",
    customerName: "Rina",
    scheduledAt: "2026-09-13T09:00:00",
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    posTransactionId: null,
    pets: [pet()],
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
  it("keeps only grooming work, with its add-ons in the value", () => {
    const rows = toGroomingRows(
      [
        booking({
          pets: [
            pet({
              services: [
                service({
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
                service({
                  itemId: "item-2",
                  serviceId: "svc-hotel",
                  name: "Hotel 1 malam",
                  serviceType: "Hotel",
                  price: "200000.0000",
                }),
              ],
            }),
            pet({
              petItemId: "pi-2",
              petName: "Milo",
              services: [
                service({ serviceId: "svc-hotel", serviceType: "Hotel" }),
              ],
            }),
          ],
        }),
      ],
      scope,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].pet.petName).toBe("Bella");
    expect(rows[0].value).toBe("185000.0000");
    expect(rows[0].durationMin).toBe(75);
    expect(rows[0].services.map((line) => line.name)).toEqual(["Basic Grooming"]);
  });

  it("lists each groomer once across turns and counts finished turns", () => {
    const sinta = { _id: "u-sinta", name: "Sinta", offReason: null };
    const [row] = toGroomingRows(
      [
        booking({
          pets: [
            pet({
              services: [
                service({
                  sessions: [
                    session({ sessionId: "s1", groomers: [sinta], status: "done" }),
                    session({
                      sessionId: "s2",
                      groomers: [sinta, { _id: "u-dedi", name: "Dedi", offReason: null }],
                    }),
                  ],
                }),
              ],
            }),
          ],
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
  const plain = booking();

  it("calls finished, unclaimed work unbilled — and nothing else", () => {
    expect(billingOf(plain, pet({ status: "completed" }))).toBe("unbilled");
    expect(billingOf(plain, pet({ status: "return_to_pawrents" }))).toBe("unbilled");
    expect(billingOf(plain, pet({ status: "in_progress" }))).toBe("not_due");
    expect(billingOf(plain, pet({ status: "cancelled" }))).toBe("not_due");
  });

  it("tells an open basket from a settled sale and an invoice", () => {
    const claimed = { status: "completed" as const, pulledToCartAt: "2026-09-13T10:00:00Z" };

    expect(billingOf(plain, pet(claimed))).toBe("in_cart");
    expect(billingOf(booking({ posTransactionId: "pos-1" }), pet(claimed))).toBe("paid");
    expect(
      billingOf(plain, pet({ status: "completed", pulledToInvoiceAt: "2026-09-13T10:00:00Z" })),
    ).toBe("invoiced");
  });
});

describe("summarisePeriod", () => {
  it("leaves cancelled animals out of the value and finds the oldest unbilled day", () => {
    const rows = toGroomingRows(
      [
        booking({
          _id: "bk-1",
          scheduledAt: "2026-09-07T09:00:00",
          pets: [pet({ status: "completed" })],
        }),
        booking({
          _id: "bk-2",
          scheduledAt: "2026-09-12T09:00:00",
          pets: [
            pet({ petItemId: "pi-2", status: "cancelled" }),
            pet({
              petItemId: "pi-3",
              status: "confirmed",
              services: [
                service({
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
              ],
            }),
          ],
        }),
      ],
      scope,
    );

    const summary = summarisePeriod(rows, new Date(2026, 8, 13));

    expect(summary.visits).toBe(2);
    expect(summary.animals).toBe(2);
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
      [
        booking({
          pets: statuses.map((status, index) =>
            pet({ petItemId: `pi-${index}`, status }),
          ),
        }),
      ],
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
        pets: [pet({ petItemId: "p-late", status: "in_progress" })],
      }),
      booking({
        _id: "early",
        bookingNumber: "BK-1",
        scheduledAt: "2026-09-13T08:00:00",
        pets: [
          pet({
            petItemId: "p-early",
            services: [service({ price: "400000.0000" })],
          }),
        ],
      }),
    ],
    scope,
  );

  it("never counts the sort towards Filter (n)", () => {
    expect(countFilters({ ...DEFAULT_FILTERS, sort: "value_desc" })).toBe(0);
    expect(countFilters({ ...DEFAULT_FILTERS, locations: ["in_home"] })).toBe(1);
  });

  it("narrows by place and by the working lens", () => {
    const home = rows.filter((row) =>
      matchesFilters(row, { ...DEFAULT_FILTERS, locations: ["in_home"] }),
    );

    expect(home.map((row) => row.key)).toEqual(["p-late"]);
    expect(rows.filter((row) => matchesLens(row, "working")).map((row) => row.key)).toEqual([
      "p-late",
    ]);
  });

  it("orders by schedule either way, and by value", () => {
    expect(sortRows(rows, "schedule_asc").map((row) => row.key)).toEqual(["p-early", "p-late"]);
    expect(sortRows(rows, "schedule_desc").map((row) => row.key)).toEqual(["p-late", "p-early"]);
    expect(sortRows(rows, "value_desc").map((row) => row.key)).toEqual(["p-early", "p-late"]);
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
