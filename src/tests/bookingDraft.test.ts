import {
  blankGroup,
  blankService,
  duplicateServiceKeys,
  groupsFromBooking,
  groupsToBelongings,
  groupsToItems,
  longestGroomerMinutes,
  UNASSIGNED,
} from "@/features/booking/bookingDraft";
import type { Booking, BookingItem, Service } from "@/types/api";

/**
 * The one place the form's shape and the API's meet.
 *
 * TESTED DIRECTLY RATHER THAN THROUGH THE SCREEN, because the property that
 * matters most — load a booking, change nothing, save it back unchanged — is
 * invisible to a rendering test: it would pass while quietly dropping every
 * add-on, and the loss would only show up on the bill.
 */
const PET_A = "5a7f1f77bcf86cd7994390d1";
const PET_B = "5a7f1f77bcf86cd7994390d2";
const MAIN = "5a7f1f77bcf86cd7994390e1";
const OTHER_MAIN = "5a7f1f77bcf86cd7994390e2";
const ADDON = "5a7f1f77bcf86cd7994390e7";

const item = (overrides: Partial<BookingItem>): BookingItem =>
  ({
    _id: "item-1",
    petId: PET_A,
    petName: "Mochi",
    serviceId: MAIN,
    parentItemId: null,
    name: "Full Grooming",
    price: "150000.0000",
    durationMin: 90,
    notes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    groomerUserId: null,
    groomerName: null,
    ...overrides,
  }) as BookingItem;

const booking = (overrides: Partial<Booking>): Booking =>
  ({
    _id: "bk-1",
    items: [],
    belongings: [],
    ...overrides,
  }) as Booking;

describe("groupsFromBooking", () => {
  it("puts one animal's services on one card", () => {
    const groups = groupsFromBooking(
      booking({
        items: [
          item({ _id: "a" }),
          item({ _id: "b", serviceId: OTHER_MAIN }),
        ],
      }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].petId).toBe(PET_A);
    expect(groups[0].services.map((line) => line.serviceId)).toEqual([
      MAIN,
      OTHER_MAIN,
    ]);
  });

  it("gives two animals two cards", () => {
    const groups = groupsFromBooking(
      booking({
        items: [item({ _id: "a" }), item({ _id: "b", petId: PET_B })],
      }),
    );

    expect(groups.map((group) => group.petId)).toEqual([PET_A, PET_B]);
  });

  it("folds an add-on back under the service it hangs off", () => {
    // The API hands back a flat list; shown flat, "Parfum" would look like a
    // service somebody chose on its own — and could not be unticked.
    const groups = groupsFromBooking(
      booking({
        items: [
          item({ _id: "parent" }),
          item({ _id: "child", serviceId: ADDON, parentItemId: "parent" }),
        ],
      }),
    );

    expect(groups[0].services).toHaveLength(1);
    expect(groups[0].services[0].addonServiceIds).toEqual([ADDON]);
  });

  it("keeps an add-on whose parent is missing rather than dropping it", () => {
    // A row that disappears from an edit form is a row that disappears from the
    // booking.
    const groups = groupsFromBooking(
      booking({
        items: [item({ _id: "child", serviceId: ADDON, parentItemId: "gone" })],
      }),
    );

    expect(groups[0].services.map((line) => line.serviceId)).toEqual([ADDON]);
  });

  it("marks a billed line locked, from either claim", () => {
    const groups = groupsFromBooking(
      booking({
        items: [
          item({ _id: "a", pulledToCartAt: "2026-09-01T00:00:00.000Z" }),
          item({
            _id: "b",
            serviceId: OTHER_MAIN,
            pulledToInvoiceAt: "2026-09-01T00:00:00.000Z",
          }),
        ],
      }),
    );

    expect(groups[0].services.map((line) => line.locked)).toEqual([true, true]);
  });

  it("shows the animal's note once, from its rows", () => {
    const groups = groupsFromBooking(
      booking({
        items: [
          item({ _id: "a", notes: "Takut hairdryer" }),
          item({ _id: "b", serviceId: OTHER_MAIN, notes: "Takut hairdryer" }),
        ],
      }),
    );

    expect(groups[0].notes).toBe("Takut hairdryer");
  });

  it("files each belonging under its own animal", () => {
    const groups = groupsFromBooking(
      booking({
        items: [item({ _id: "a" }), item({ _id: "b", petId: PET_B })],
         
        belongings: [
          { petId: PET_B, name: "Carrier biru" },
          { petId: PET_A, name: "Kalung merah" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    );

    expect(groups[0].belongings).toEqual(["Kalung merah"]);
    expect(groups[1].belongings).toEqual(["Carrier biru"]);
  });

  it("never returns an empty form", () => {
    expect(groupsFromBooking(booking({}))).toHaveLength(1);
  });
});

describe("groupsToItems", () => {
  it("sends one row per service, carrying its add-ons on the parent", () => {
    const group = blankGroup(PET_A);
    group.services = [
      { ...blankService(), serviceId: MAIN, addonServiceIds: [ADDON] },
    ];

    expect(groupsToItems([group])).toEqual([
      expect.objectContaining({
        petId: PET_A,
        serviceId: MAIN,
        addonServiceIds: [ADDON],
      }),
    ]);
  });

  it("writes the animal's one note onto each of its rows", () => {
    // `bookingitems.notes` is "anything special about THIS animal on THIS
    // visit" — a per-animal fact stored per row. Asking once and fanning it out
    // is what makes the screen match the field's meaning.
    const group = blankGroup(PET_A);
    group.notes = "  Takut hairdryer  ";
    group.services = [
      { ...blankService(), serviceId: MAIN },
      { ...blankService(), serviceId: OTHER_MAIN },
    ];

    expect(groupsToItems([group]).map((row) => row.notes)).toEqual([
      "Takut hairdryer",
      "Takut hairdryer",
    ]);
  });

  it("drops a line nobody chose a service for", () => {
    const group = blankGroup(PET_A);
    group.services = [{ ...blankService(), serviceId: MAIN }, blankService()];

    expect(groupsToItems([group])).toHaveLength(1);
  });

  it("drops a card with no animal chosen", () => {
    const group = blankGroup();
    group.services = [{ ...blankService(), serviceId: MAIN }];

    expect(groupsToItems([group])).toEqual([]);
  });

  it("omits durationMin when nobody typed one", () => {
    const group = blankGroup(PET_A);
    group.services = [{ ...blankService(), serviceId: MAIN }];

    expect(groupsToItems([group])[0].durationMin).toBeUndefined();
  });

  it("turns the unassigned sentinel back into null", () => {
    const group = blankGroup(PET_A);
    group.services = [
      { ...blankService(), serviceId: MAIN, groomerUserId: UNASSIGNED },
    ];

    expect(groupsToItems([group])[0].groomerUserId).toBeNull();
  });
});

describe("the round trip", () => {
  it("loads a booking and sends back what it loaded", () => {
    /*
      THE PROPERTY THAT MATTERS. Opening a booking, changing nothing and saving
      must not alter it — and the add-on is the part a naive conversion loses,
      silently, because it looks like a row nobody chose.
    */
    const loaded = booking({
      items: [
        item({ _id: "p1", groomerUserId: "groomer-1", durationMin: 90 }),
        item({ _id: "a1", serviceId: ADDON, parentItemId: "p1" }),
        item({ _id: "p2", petId: PET_B, serviceId: OTHER_MAIN, durationMin: 60 }),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      belongings: [{ petId: PET_A, name: "Carrier biru" }] as any,
    });

    const items = groupsToItems(groupsFromBooking(loaded));

    expect(items).toEqual([
      expect.objectContaining({
        petId: PET_A,
        serviceId: MAIN,
        addonServiceIds: [ADDON],
        groomerUserId: "groomer-1",
        durationMin: 90,
      }),
      expect.objectContaining({
        petId: PET_B,
        serviceId: OTHER_MAIN,
        durationMin: 60,
      }),
    ]);

    expect(groupsToBelongings(groupsFromBooking(loaded))).toEqual([
      { petId: PET_A, name: "Carrier biru" },
    ]);
  });
});

describe("groupsToBelongings", () => {
  it("drops blanks and trims what is left", () => {
    const group = blankGroup(PET_A);
    group.belongings = ["  Kalung merah  ", "   ", ""];

    expect(groupsToBelongings([group])).toEqual([
      { petId: PET_A, name: "Kalung merah" },
    ]);
  });
});

describe("duplicateServiceKeys", () => {
  it("flags the LATER line, not the one filled in first", () => {
    const group = blankGroup(PET_A);
    const first = { ...blankService(), serviceId: MAIN };
    const second = { ...blankService(), serviceId: MAIN };
    group.services = [first, second];

    const duplicates = duplicateServiceKeys([group]);

    expect(duplicates.has(second.key)).toBe(true);
    expect(duplicates.has(first.key)).toBe(false);
  });

  it("allows two ANIMALS to have the same service — the case PCR-040 exists for", () => {
    const a = blankGroup(PET_A);
    a.services = [{ ...blankService(), serviceId: MAIN }];
    const b = blankGroup(PET_B);
    b.services = [{ ...blankService(), serviceId: MAIN }];

    expect(duplicateServiceKeys([a, b]).size).toBe(0);
  });

  it("catches one add-on ticked under two of an animal's services", () => {
    // One perfume, charged twice — the server refuses it, so the form has to
    // see it too or the refusal arrives with nothing highlighted.
    const group = blankGroup(PET_A);
    group.services = [
      { ...blankService(), serviceId: MAIN, addonServiceIds: [ADDON] },
      { ...blankService(), serviceId: OTHER_MAIN, addonServiceIds: [ADDON] },
    ];

    expect(duplicateServiceKeys([group]).size).toBe(1);
  });
});

describe("longestGroomerMinutes", () => {
  const catalogue: Record<string, Service> = {
    [MAIN]: { durationMin: 90 } as Service,
    [OTHER_MAIN]: { durationMin: 60 } as Service,
    [ADDON]: { durationMin: 30 } as Service,
  };
  const serviceOf = (id: string) => catalogue[id] ?? null;

  it("takes the longest groomer's chain, never the sum", () => {
    // Mochi with Sinta for 90 and Coco with Rio for 60 means the visit takes 90.
    const a = blankGroup(PET_A);
    a.services = [
      { ...blankService(), serviceId: MAIN, groomerUserId: "sinta" },
    ];
    const b = blankGroup(PET_B);
    b.services = [
      { ...blankService(), serviceId: OTHER_MAIN, groomerUserId: "rio" },
    ];

    expect(longestGroomerMinutes([a, b], serviceOf)).toBe(90);
  });

  it("sums the lines one groomer is doing — nobody does two animals at once", () => {
    const a = blankGroup(PET_A);
    a.services = [
      { ...blankService(), serviceId: MAIN, groomerUserId: "sinta" },
    ];
    const b = blankGroup(PET_B);
    b.services = [
      { ...blankService(), serviceId: OTHER_MAIN, groomerUserId: "sinta" },
    ];

    expect(longestGroomerMinutes([a, b], serviceOf)).toBe(150);
  });

  it("adds an add-on's minutes to the groomer doing it", () => {
    const group = blankGroup(PET_A);
    group.services = [
      {
        ...blankService(),
        serviceId: MAIN,
        addonServiceIds: [ADDON],
        groomerUserId: "sinta",
      },
    ];

    expect(longestGroomerMinutes([group], serviceOf)).toBe(120);
  });

  it("prefers a typed duration over the catalogue's, for the parent only", () => {
    const group = blankGroup(PET_A);
    group.services = [
      {
        ...blankService(),
        serviceId: MAIN,
        durationMin: "45",
        addonServiceIds: [ADDON],
        groomerUserId: "sinta",
      },
    ];

    expect(longestGroomerMinutes([group], serviceOf)).toBe(75);
  });
});
