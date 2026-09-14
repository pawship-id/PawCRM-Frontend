import { priceForPet } from "@/utils/serviceVariant";
import type {
  Booking,
  BookingBelongingInput,
  CreateBookingEntry,
  Pet,
  Service,
  UpdateBookingInput,
} from "@/types/api";

/**
 * The shape the booking form holds while somebody fills it in — and the
 * conversions between it and the API's.
 *
 * ─── ONE CARD IS ONE BOOKING ───────────────────────────────────────────────
 *
 * A booking is one animal and one main service, with add-ons under it. The form
 * asks in that order — which animal, what is being done to it, what is added to
 * that — so a card holds exactly those answers and nothing about any other
 * booking. Bu Lisa bringing Mochi and Coco is two cards; Mochi having a bath and
 * a hotel stay is two cards too, and the same animal may appear on both.
 *
 * What the bookings of one save SHARE — who, where, when, the trip — is the
 * form's header, not part of a card. See `BookingForm`.
 *
 * ─── PURE, SO IT CAN BE TESTED WITHOUT A SCREEN ────────────────────────────
 *
 * No React, no fetching. The round trip that matters — load a booking, edit
 * nothing, save it back unchanged — is a property this file can be held to
 * directly, and it is exactly the kind of thing a rendering test would miss.
 */

/** The sentinel for "Belum ditentukan" — a real state, not a gap (FR-3). */
export const UNASSIGNED = "belum-ditentukan";

/** Mirrors MAX_BOOKINGS_PER_GROUP in booking.model.js — one save, at most ten. */
export const MAX_CARDS = 10;

/**
 * One thing the owner is handing over. `_id` and `checkedInAt` are carried on an
 * edit so saving the list back keeps what the counter already ticked in.
 */
export type BelongingDraft = BookingBelongingInput;

export interface BookingCardDraft {
  /** Local identity. Never sent — two empty cards look identical. */
  key: string;
  petId: string;
  /**
   * WHICH LINE OF BUSINESS the service picker is narrowed to.
   *
   * A FILTER, NOT A FIELD: never sent, because the service already names its
   * own.
   */
  businessLineId: string;
  /** The ONE main service. */
  serviceId: string;
  /** The add-ons ticked under it, by service id. */
  addonServiceIds: string[];
  /** As typed; "" means "use the catalogue's". */
  durationMin: string;
  /**
   * THE GROOMER THE BOOKING STARTS WITH — a DEFAULT, not the last word.
   *
   * At booking time it is one answer: "Sinta is doing Bruno today". Who actually
   * stands at each session — and whether a second pair of hands joins one of
   * them — is settled on the booking's own page once the day is running.
   */
  groomerUserId: string;
  /**
   * ─── TWO NOTES, TWO AUDIENCES ─────────────────────────────────────────────
   *
   * There was one, and it held operational instructions. A shop wanting to tell
   * the OWNER something had nowhere to put it but the same box — and whichever
   * way that box is then treated it is wrong: shown to the customer it leaks,
   * hidden from them the advice never arrives.
   */
  internalNotes: string;
  /** For the owner to read. Staff still write it — see `Booking`. */
  customerNotes: string;
  /** What the owner is handing over with this animal. */
  belongings: BelongingDraft[];
  /**
   * Already billed, so the service may not be changed (PRD 2.12). Held on the
   * draft rather than in a side set: a locked service is a property of that
   * card, and a parallel `Set` keyed by string is how the two drift.
   */
  locked: boolean;
}

let seq = 0;

/** A fresh card, optionally with its animal already chosen. */
export function blankCard(petId = ""): BookingCardDraft {
  seq += 1;
  return {
    key: `card-${seq}`,
    petId,
    businessLineId: "",
    serviceId: "",
    addonServiceIds: [],
    durationMin: "",
    groomerUserId: UNASSIGNED,
    internalNotes: "",
    customerNotes: "",
    belongings: [],
    locked: false,
  };
}

/**
 * A booking as the API returns it → the one card the edit form shows.
 *
 * THE GROOMER IS THE FIRST PERSON ON THE FIRST SESSION. The API stores a crew
 * per session, and by the time a booking is being edited those may genuinely
 * differ — the day ran, and one turn was handed to somebody else. The card shows
 * the first answer rather than inventing a blank; per-session crews are changed
 * on the booking's own page, not here.
 */
export function cardFromBooking(booking: Booking): BookingCardDraft {
  const service = booking.service;
  const firstGroomer = service?.sessions?.[0]?.groomers?.[0]?._id;

  return {
    ...blankCard(booking.petId),
    serviceId: service?.serviceId ?? "",
    addonServiceIds: (service?.addons ?? []).map((addon) => addon.serviceId),
    // Shown as typed, so saving without touching it keeps the number.
    durationMin:
      service?.durationMin === null || service?.durationMin === undefined
        ? ""
        : String(service.durationMin),
    groomerUserId: firstGroomer ?? UNASSIGNED,
    internalNotes: booking.internalNotes ?? "",
    customerNotes: booking.customerNotes ?? "",
    belongings: (booking.belongings ?? []).map((belonging) => ({
      _id: belonging._id,
      name: belonging.name,
      checkedInAt: belonging.checkedInAt,
    })),
    locked: Boolean(booking.pulledToCartAt || booking.pulledToInvoiceAt),
  };
}

/** "" → null, anything else trimmed. */
const noteOf = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

/** Blank names dropped, the rest trimmed — a half-typed row is not a thing. */
const belongingsOf = (card: BookingCardDraft): BelongingDraft[] =>
  card.belongings
    .map((belonging) => ({ ...belonging, name: belonging.name.trim() }))
    .filter((belonging) => belonging.name !== "");

/**
 * The fields one card contributes, in the names both `POST` and `PATCH` use.
 *
 * `durationMin` IS OMITTED WHEN NOBODY TYPED ONE, rather than sent as the
 * catalogue's number: the server snapshots from the catalogue itself, so sending
 * nothing keeps the appointment following a duration the shop may still correct
 * before Thursday.
 */
function cardFields(card: BookingCardDraft) {
  return {
    petId: card.petId,
    serviceId: card.serviceId,
    addonServiceIds: card.addonServiceIds,
    durationMin:
      card.durationMin.trim() === "" ? undefined : Number(card.durationMin),
    /* FR-3's "Belum ditentukan" is a real state, sent as null. */
    groomerUserId:
      card.groomerUserId === UNASSIGNED ? null : card.groomerUserId,
    internalNotes: noteOf(card.internalNotes),
    customerNotes: noteOf(card.customerNotes),
  };
}

/**
 * The cards → `bookings[]` for `POST /bookings`.
 *
 * A card with no animal or no service is DROPPED rather than sent empty — a card
 * somebody added and did not fill in is not a booking, and the server would
 * refuse it by field name. `_id` never goes on a create.
 */
export function cardsToEntries(cards: BookingCardDraft[]): CreateBookingEntry[] {
  return cards
    .filter((card) => card.petId !== "" && card.serviceId !== "")
    .map((card) => ({
      ...cardFields(card),
      belongings: belongingsOf(card).map(({ name, checkedInAt }) => ({
        name,
        ...(checkedInAt ? { checkedInAt } : {}),
      })),
    }));
}

/**
 * The edit form's one card → the flat fields `PATCH /bookings/:id` takes.
 *
 * BELONGINGS GO WHOLESALE, `_id` INCLUDED: what the list holds is the booking's
 * belongings afterwards, and the id is what keeps a stored item's check-in.
 */
export function cardToUpdate(
  card: BookingCardDraft,
): Pick<
  UpdateBookingInput,
  | "petId"
  | "serviceId"
  | "addonServiceIds"
  | "durationMin"
  | "groomerUserId"
  | "internalNotes"
  | "customerNotes"
  | "belongings"
> {
  return { ...cardFields(card), belongings: belongingsOf(card) };
}

/** One animal and one service, as a key. */
export function petServiceKey(petId: string, serviceId: string): string {
  return `${petId}|${serviceId}`;
}

/**
 * WHICH CARDS REPEAT AN ANIMAL AND A MAIN SERVICE ALREADY ON ANOTHER CARD — by
 * card key, so the message lands on the card somebody just added rather than the
 * one they filled in five minutes ago (PRD 2.7).
 *
 * THE SAME ANIMAL ON TWO CARDS IS ALLOWED, and that is the point of a card being
 * one booking: a bath and a hotel stay are two bookings. The SAME service twice
 * for the same animal at the same time is not — it is one grooming booked twice.
 */
export function duplicateCardKeys(cards: BookingCardDraft[]): Set<string> {
  const duplicates = new Set<string>();
  const seen = new Set<string>();

  for (const card of cards) {
    if (card.petId === "" || card.serviceId === "") continue;

    const pair = petServiceKey(card.petId, card.serviceId);
    if (seen.has(pair)) duplicates.add(card.key);
    else seen.add(pair);
  }

  return duplicates;
}

/**
 * EVERY (ANIMAL, SERVICE) PAIR A STORED BOOKING ALREADY HOLDS — the main service
 * and its add-ons, by the same key `petServiceKey` makes.
 *
 * ─── WHY THE FORM NEEDS TO KNOW (13 September 2026) ───────────────────────
 *
 * A variant can be switched off in the catalogue, and the server refuses a NEW
 * line for one. But a booking taken last week for a variant switched off
 * yesterday is still that customer's appointment: on an edit the server lets a
 * pair that was already on the booking through, re-quoting it with the inactive
 * variant allowed. So the form blocks an inactive variant only for a pair this
 * set does not hold — otherwise correcting the time of an old booking would be
 * refused over a service nobody touched.
 */
export function storedPetServiceKeys(booking: Booking): Set<string> {
  const service = booking.service;
  if (!service) return new Set();

  return new Set(
    [service.serviceId, ...(service.addons ?? []).map((addon) => addon.serviceId)]
      .filter(Boolean)
      .map((serviceId) => petServiceKey(booking.petId, serviceId)),
  );
}

/**
 * WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
 * never the sum (PRD 2.9).
 *
 * Two groomers work at the same time: Mochi with Sinta for 90 minutes and Coco
 * with Rio for 60 means the visit takes 90, not 150. Cards sharing a groomer ARE
 * summed, because one person cannot do two animals at once, and cards with
 * nobody assigned are grouped together — which over-estimates rather than
 * under-, and promising an earlier finish than the shop can manage is the
 * mistake that sends somebody home late.
 *
 * AN ADD-ON'S MINUTES COUNT TOWARDS ITS CARD'S GROOMER, because that is who
 * does it. The stored answer, per booking, is the server's.
 */
export function longestGroomerMinutes(
  cards: BookingCardDraft[],
  serviceOf: (id: string) => Service | null,
  /*
    THE ANIMAL, BECAUSE THE MINUTES ARE ITS OWN (13 September 2026). A service
    priced by variant has no service-level `durationMin` any more — a large dog's
    grooming takes longer than a small one's, and each variant says how long.
    Reading `service.durationMin` would find null and quietly count nothing.
  */
  petOf: (id: string) => Pet | null,
): number {
  const perGroomer = new Map<string, number>();

  for (const card of cards) {
    const pet = petOf(card.petId);
    const minutesOf = (id: string) =>
      priceForPet(serviceOf(id), pet).durationMin ?? 0;

    const typed = Number(card.durationMin);
    const own =
      card.durationMin.trim() !== "" && Number.isFinite(typed) && typed > 0
        ? typed
        : minutesOf(card.serviceId);

    const addons = card.addonServiceIds.reduce(
      (total, id) => total + minutesOf(id),
      0,
    );

    const minutes = own + addons;
    if (minutes <= 0) continue;

    perGroomer.set(
      card.groomerUserId,
      (perGroomer.get(card.groomerUserId) ?? 0) + minutes,
    );
  }

  return Math.max(0, ...perGroomer.values());
}
