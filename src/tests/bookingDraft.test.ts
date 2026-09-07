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
    internalNotes: null,
    customerNotes: null,
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

  it("shows each of the animal's notes once, from its rows", () => {
    const groups = groupsFromBooking(
      booking({
        items: [
          item({
            _id: "a",
            internalNotes: "Takut hairdryer",
            customerNotes: "Sarankan 3 minggu sekali",
          }),
          item({
            _id: "b",
            serviceId: OTHER_MAIN,
            internalNotes: "Takut hairdryer",
            customerNotes: "Sarankan 3 minggu sekali",
          }),
        ],
      }),
    );

    expect(groups[0].internalNotes).toBe("Takut hairdryer");
    expect(groups[0].customerNotes).toBe("Sarankan 3 minggu sekali");
  });

  it("collapses the two notes independently of each other", () => {
    /*
      A BOOKING WHOSE ROWS DISAGREE — one written before the split, one after,
      or an edit that reached only some rows. Testing the pair together would
      take whichever the FIRST non-empty row happened to carry and silently drop
      the other half, which the reader would then re-save as deleted.
    */
    const groups = groupsFromBooking(
      booking({
        items: [
          item({ _id: "a", internalNotes: "Takut hairdryer", customerNotes: null }),
          item({
            _id: "b",
            serviceId: OTHER_MAIN,
            internalNotes: null,
            customerNotes: "Sarankan 3 minggu sekali",
          }),
        ],
      }),
    );

    expect(groups[0].internalNotes).toBe("Takut hairdryer");
    expect(groups[0].customerNotes).toBe("Sarankan 3 minggu sekali");
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

  it("writes both of the animal's notes onto each of its rows", () => {
    // Both are "anything special about THIS animal on THIS visit" — per-animal
    // facts stored per row. Asking once and fanning them out is what makes the
    // screen match the fields' meaning.
    const group = blankGroup(PET_A);
    group.internalNotes = "  Takut hairdryer  ";
    group.customerNotes = "  Sarankan 3 minggu sekali  ";
    group.services = [
      { ...blankService(), serviceId: MAIN },
      { ...blankService(), serviceId: OTHER_MAIN },
    ];

    const rows = groupsToItems([group]);

    expect(rows.map((row) => row.internalNotes)).toEqual([
      "Takut hairdryer",
      "Takut hairdryer",
    ]);
    expect(rows.map((row) => row.customerNotes)).toEqual([
      "Sarankan 3 minggu sekali",
      "Sarankan 3 minggu sekali",
    ]);
  });

  it("sends null for a note nobody typed, never an empty string", () => {
    /*
      NULL IS THE ABSENCE OF A NOTE; "" is a note somebody wrote nothing in. The
      screens test truthiness so the two look alike there, but a shop exporting
      its bookings would find blanks where it expected nothing.
    */
    const group = blankGroup(PET_A);
    group.internalNotes = "Takut hairdryer";
    group.customerNotes = "   ";
    group.services = [{ ...blankService(), serviceId: MAIN }];

    expect(groupsToItems([group])[0]).toMatchObject({
      internalNotes: "Takut hairdryer",
      customerNotes: null,
    });
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
    group.groomerUserId = UNASSIGNED;
    group.services = [{ ...blankService(), serviceId: MAIN }];

    expect(groupsToItems([group])[0].groomerUserId).toBeNull();
  });

  it("writes the animal's one groomer onto each of its rows", () => {
    /*
      ASKED ONCE PER ANIMAL, applied to every session — the same fan-out the note
      gets. At booking a shop says "Sinta is doing Bruno today", not one name per
      line; who actually stands at each session is settled on the booking's page.
    */
    const group = blankGroup(PET_A);
    group.groomerUserId = "groomer-1";
    group.services = [
      { ...blankService(), serviceId: MAIN },
      { ...blankService(), serviceId: OTHER_MAIN },
    ];

    expect(groupsToItems([group]).map((row) => row.groomerUserId)).toEqual([
      "groomer-1",
      "groomer-1",
    ]);
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
    a.groomerUserId = "sinta";
    a.services = [
      { ...blankService(), serviceId: MAIN },
    ];
    const b = blankGroup(PET_B);
    b.groomerUserId = "rio";
    b.services = [{ ...blankService(), serviceId: OTHER_MAIN }];

    expect(longestGroomerMinutes([a, b], serviceOf)).toBe(90);
  });

  it("sums the lines one groomer is doing — nobody does two animals at once", () => {
    const a = blankGroup(PET_A);
    a.groomerUserId = "sinta";
    a.services = [
      { ...blankService(), serviceId: MAIN },
    ];
    const b = blankGroup(PET_B);
    b.groomerUserId = "sinta";
    b.services = [{ ...blankService(), serviceId: OTHER_MAIN }];

    expect(longestGroomerMinutes([a, b], serviceOf)).toBe(150);
  });

  it("adds an add-on's minutes to the groomer doing it", () => {
    const group = blankGroup(PET_A);
    group.services = [
      {
        ...blankService(),
        serviceId: MAIN,
        addonServiceIds: [ADDON],
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
      },
    ];

    expect(longestGroomerMinutes([group], serviceOf)).toBe(75);
  });
});
