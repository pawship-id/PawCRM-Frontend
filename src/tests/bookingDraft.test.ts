import {
  MAX_CARDS,
  blankCard,
  cardFromBooking,
  cardToUpdate,
  cardsToEntries,
  duplicateCardKeys,
  longestGroomerMinutes,
  petServiceKey,
  storedPetServiceKeys,
  UNASSIGNED,
} from "@/features/booking/bookingDraft";
import type { BookingCardDraft } from "@/features/booking/bookingDraft";
import type {
  Booking,
  BookingSession,
  Pet,
  Service,
  ServiceVariant,
} from "@/types/api";
import { petOptionFields } from "./helpers/petOptions";

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

const session = (over: Partial<BookingSession> = {}): BookingSession => ({
  sessionId: "se-1",
  sessionName: "Full Grooming",
  groomers: [],
  status: "pending",
  startedAt: null,
  finishedAt: null,
  notesSession: null,
  notesInternalSession: null,
  media: [],
  commissionWeight: null,
  ...over,
});

type Overrides = Omit<Partial<Booking>, "service"> & {
  service?: Partial<Booking["service"]>;
};

const booking = ({ service, ...over }: Overrides = {}): Booking =>
  ({
    _id: "bk-1",
    petId: PET_A,
    petName: "Mochi",
    service: {
      serviceId: MAIN,
      name: "Full Grooming",
      serviceType: "Grooming",
      price: "150000.0000",
      durationMin: 90,
      status: "pending",
      statusHistory: [],
      startedAt: null,
      finishedAt: null,
      sessions: [],
      addons: [],
      ...service,
    },
    belongings: [],
    internalNotes: null,
    customerNotes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    ...over,
  }) as Booking;

const card = (over: Partial<BookingCardDraft> = {}): BookingCardDraft => ({
  ...blankCard(PET_A),
  serviceId: MAIN,
  ...over,
});

describe("bookingDraft — one card is one booking", () => {
  it("starts a card with nobody assigned and nothing chosen", () => {
    const fresh = blankCard();

    expect(fresh).toMatchObject({
      petId: "",
      serviceId: "",
      addonServiceIds: [],
      durationMin: "",
      groomerUserId: UNASSIGNED,
      internalNotes: "",
      customerNotes: "",
      belongings: [],
      locked: false,
    });
    /* Two empty cards look identical; only the key tells them apart. */
    expect(blankCard().key).not.toBe(fresh.key);
  });

  it("caps a save at ten bookings, like the server", () => {
    expect(MAX_CARDS).toBe(10);
  });

  it("loads a booking into one card — its service, add-ons, duration and notes", () => {
    const loaded = cardFromBooking(
      booking({
        service: {
          durationMin: 120,
          addons: [
            {
              itemId: "ad-1",
              serviceId: ADDON,
              name: "Parfum",
              price: "20000.0000",
              durationMin: 10,
            },
          ],
        },
        internalNotes: "Takut hairdryer",
        customerNotes: "Sarankan 3 minggu sekali",
      }),
    );

    expect(loaded).toMatchObject({
      petId: PET_A,
      serviceId: MAIN,
      addonServiceIds: [ADDON],
      durationMin: "120",
      internalNotes: "Takut hairdryer",
      customerNotes: "Sarankan 3 minggu sekali",
      locked: false,
    });
  });

  it("takes the groomer from the first person on the first session", () => {
    /*
      THE API STORES A CREW PER SESSION, and by the time a booking is edited
      those may differ. The card shows the first answer rather than a blank.
    */
    const loaded = cardFromBooking(
      booking({
        service: {
          sessions: [
            session({ groomers: [{ _id: "user-1", name: "Sinta", offReason: null }] }),
            session({
              sessionId: "se-2",
              groomers: [{ _id: "user-2", name: "Rio", offReason: null }],
            }),
          ],
        },
      }),
    );

    expect(loaded.groomerUserId).toBe("user-1");
    expect(cardFromBooking(booking()).groomerUserId).toBe(UNASSIGNED);
  });

  it("locks a card whose booking a basket or a bill has claimed", () => {
    expect(
      cardFromBooking(booking({ pulledToCartAt: "2026-09-01T04:00:00.000Z" }))
        .locked,
    ).toBe(true);
    expect(
      cardFromBooking(booking({ pulledToInvoiceAt: "2026-09-01T04:00:00.000Z" }))
        .locked,
    ).toBe(true);
  });

  it("round-trips a loaded booking back to the same fields, add-ons and check-ins included", () => {
    const loaded = cardFromBooking(
      booking({
        service: {
          addons: [
            {
              itemId: "ad-1",
              serviceId: ADDON,
              name: "Parfum",
              price: "20000.0000",
              durationMin: 10,
            },
          ],
          sessions: [
            session({ groomers: [{ _id: "user-1", name: "Sinta", offReason: null }] }),
          ],
        },
        belongings: [
          {
            _id: "bel-1",
            name: "Carrier biru",
            checkedInAt: "2026-09-01T03:00:00.000Z",
            checkedOutAt: null,
            checkedInBy: null,
            checkedOutBy: null,
          },
        ],
      }),
    );

    expect(cardToUpdate(loaded)).toEqual({
      petId: PET_A,
      serviceId: MAIN,
      addonServiceIds: [ADDON],
      durationMin: 90,
      groomerUserId: "user-1",
      internalNotes: null,
      customerNotes: null,
      /* THE ID GOES BACK, so the stored item keeps its check-in. */
      belongings: [
        {
          _id: "bel-1",
          name: "Carrier biru",
          checkedInAt: "2026-09-01T03:00:00.000Z",
        },
      ],
    });
  });

  it("turns each complete card into one entry, and drops the half-filled ones", () => {
    const entries = cardsToEntries([
      card(),
      card({ petId: "" }),
      card({ serviceId: "" }),
    ]);

    expect(entries).toEqual([
      {
        petId: PET_A,
        serviceId: MAIN,
        addonServiceIds: [],
        /* Nobody typed over the catalogue, so nothing is sent. */
        durationMin: undefined,
        groomerUserId: null,
        internalNotes: null,
        customerNotes: null,
        belongings: [],
      },
    ]);
  });

  it("sends the same animal twice when it is on two cards with two services", () => {
    const entries = cardsToEntries([
      card({ serviceId: MAIN }),
      card({ serviceId: OTHER_MAIN }),
    ]);

    expect(entries.map((entry) => [entry.petId, entry.serviceId])).toEqual([
      [PET_A, MAIN],
      [PET_A, OTHER_MAIN],
    ]);
  });

  it("sends each card's own notes, groomer, duration and belongings — never an id on a create", () => {
    const [entry] = cardsToEntries([
      card({
        groomerUserId: "user-1",
        durationMin: "45",
        internalNotes: "  Takut hairdryer  ",
        customerNotes: "",
        belongings: [{ name: "Carrier biru" }, { name: "   " }],
      }),
    ]);

    expect(entry).toMatchObject({
      groomerUserId: "user-1",
      durationMin: 45,
      internalNotes: "Takut hairdryer",
      customerNotes: null,
      belongings: [{ name: "Carrier biru" }],
    });
  });
});

describe("bookingDraft — duplicates", () => {
  it("flags the SECOND card that repeats an animal and a main service", () => {
    const first = card();
    const second = card();

    expect(duplicateCardKeys([first, second])).toEqual(new Set([second.key]));
  });

  it("lets the same animal have two different services", () => {
    expect(
      duplicateCardKeys([card(), card({ serviceId: OTHER_MAIN })]).size,
    ).toBe(0);
  });

  it("lets two animals have the same service", () => {
    expect(duplicateCardKeys([card(), card({ petId: PET_B })]).size).toBe(0);
  });

  it("ignores cards that are not filled in yet", () => {
    expect(
      duplicateCardKeys([card({ serviceId: "" }), card({ serviceId: "" })]).size,
    ).toBe(0);
  });
});

describe("bookingDraft — what a stored booking already holds", () => {
  it("keys the main service and every add-on by the booking's animal", () => {
    const keys = storedPetServiceKeys(
      booking({
        service: {
          addons: [
            {
              itemId: "ad-1",
              serviceId: ADDON,
              name: "Parfum",
              price: "20000.0000",
              durationMin: 10,
            },
          ],
        },
      }),
    );

    expect(keys).toEqual(
      new Set([petServiceKey(PET_A, MAIN), petServiceKey(PET_A, ADDON)]),
    );
  });
});

describe("bookingDraft — when the customer gets their animals back", () => {
  const services: Record<string, Service> = {
    [MAIN]: { _id: MAIN, durationMin: 90, price: "1" } as Service,
    [OTHER_MAIN]: { _id: OTHER_MAIN, durationMin: 60, price: "1" } as Service,
    [ADDON]: { _id: ADDON, durationMin: 15, price: "1" } as Service,
  };
  const serviceOf = (id: string) => services[id] ?? null;
  /*
    `petOptionFields` rather than `size: "opt-size-kecil"` — a pet stores the option's
    id and the variant seam reads the `sizeCode` beside it (25 September 2026).
  */
  const petOf = (id: string) =>
    ({ _id: id, ...petOptionFields({ size: "Kecil" }) }) as Pet;

  it("takes the longest groomer, not the sum", () => {
    expect(
      longestGroomerMinutes(
        [
          card({ groomerUserId: "sinta" }),
          card({ petId: PET_B, serviceId: OTHER_MAIN, groomerUserId: "rio" }),
        ],
        serviceOf,
        petOf,
      ),
    ).toBe(90);
  });

  it("sums cards that share a groomer, add-ons included", () => {
    expect(
      longestGroomerMinutes(
        [
          card({ groomerUserId: "sinta", addonServiceIds: [ADDON] }),
          card({ petId: PET_B, serviceId: OTHER_MAIN, groomerUserId: "sinta" }),
        ],
        serviceOf,
        petOf,
      ),
    ).toBe(90 + 15 + 60);
  });

  it("uses a typed duration over the catalogue's", () => {
    expect(
      longestGroomerMinutes([card({ durationMin: "120" })], serviceOf, petOf),
    ).toBe(120);
  });

  it("reads a variant service's minutes from the animal", () => {
    const variant = {
      _id: MAIN,
      price: null,
      durationMin: null,
      hasVariants: true,
      variantAxes: ["sizeCategory"],
      variants: [
        {
          petType: null,
          sizeCategory: "opt-size-besar",
          furType: null,
          price: "180000.0000",
          durationMin: 150,
          isActive: true,
        } as unknown as ServiceVariant,
      ],
    } as unknown as Service;

    expect(
      longestGroomerMinutes(
        [card()],
        () => variant,
        (id) => ({ _id: id, ...petOptionFields({ size: "Besar" }) }) as Pet,
      ),
    ).toBe(150);
  });
});

/* ─── PRICED BEYOND THE PET (17 September 2026) ───────────────────────────── */
describe("bookingDraft — opsi dipilih staf", () => {
  const LOKASI = "vo-lokasi";
  const EXTRA = "vo-extra";

  const priced = (id: string, axes: string[]) =>
    ({ _id: id, hasVariants: true, variantAxes: axes }) as unknown as Service;
  const catalogue: Record<string, Service> = {
    [MAIN]: priced(MAIN, ["zone", LOKASI]),
    [ADDON]: priced(ADDON, [LOKASI, EXTRA]),
  };
  const serviceOf = (id: string) => catalogue[id] ?? null;

  it("loads the stored choices onto the card, without their words", () => {
    const loaded = cardFromBooking(
      booking({
        service: {
          variantChoices: [{ optionId: LOKASI, code: "rumah", name: "Lokasi", label: "Di Rumah" }],
        },
      }),
    );

    expect(loaded.variantChoices).toEqual([{ optionId: LOKASI, code: "rumah" }]);
  });

  it("sends the main service's choices, and an add-on's own only for a card the service lacks", () => {
    const [entry] = cardsToEntries(
      [
        card({
          addonServiceIds: [ADDON],
          variantChoices: [
            { optionId: LOKASI, code: "rumah" },
            { optionId: EXTRA, code: "ya" },
          ],
        }),
      ],
      serviceOf,
    );

    expect(entry.variantChoices).toEqual([{ optionId: LOKASI, code: "rumah" }]);
    expect(entry.addonPricing).toEqual([
      {
        serviceId: ADDON,
        variantChoices: [
          { optionId: LOKASI, code: "rumah" },
          { optionId: EXTRA, code: "ya" },
        ],
      },
    ]);
  });

  it("sends no choices for a pet-only service", () => {
    const [entry] = cardsToEntries([card({ variantChoices: [] })]);

    expect(entry).not.toHaveProperty("variantChoices");
    expect(entry).not.toHaveProperty("addonPricing");
  });

  it("sends the choices on an edit, but never for a billed card", () => {
    const choices = [{ optionId: LOKASI, code: "toko" }];

    expect(cardToUpdate(card({ variantChoices: choices }), serviceOf)).toMatchObject({
      variantChoices: choices,
    });
    expect(
      cardToUpdate(card({ variantChoices: choices, locked: true }), serviceOf),
    ).not.toHaveProperty("variantChoices");
  });
});
