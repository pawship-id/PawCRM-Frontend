import type {
  Booking,
  Service,
  TripLeg,
  VariantChoice,
  VariantOption,
} from "@/types/api";
import { toDecimalString, toMinor } from "@/utils/decimal";
import { staffAxesOf } from "@/utils/serviceVariant";

/**
 * The arithmetic of a ride that is not money — its direction, its ends, its
 * clock. PURE, so it is tested without a DOM (`src/tests/antarJemputRide.test.ts`).
 *
 * A RIDE IS ONE BOOKING (decided 21 September 2026): one direction, one van,
 * the booking's own animal plus the passengers riding with it. "Antar Jemput"
 * is two rides saved one after the other in one visit.
 */

/** What the form's Arah offers — one direction, or both as two bookings. */
export type LegChoice = TripLeg | "both";

export const LEG_LABEL: Record<TripLeg, string> = {
  pickup: "Jemput",
  delivery: "Antar",
};

/*
  "ANTAR JEMPUT", NOT "PULANG-PERGI" (23 September 2026, on request). It is the
  name of the service the shop sells, and the one the shop says out loud; the
  earlier wording was this file's own choice, not anybody's.
*/
export const LEG_CHOICES: { value: LegChoice; label: string; hint: string }[] = [
  { value: "pickup", label: "Jemput", hint: "Dari alamat pelanggan ke cabang" },
  { value: "delivery", label: "Antar", hint: "Dari cabang ke alamat pelanggan" },
  { value: "both", label: "Antar Jemput", hint: "Jemput lalu antar — 2 booking" },
];

/*
  ─── THE TWO TRIPS THE SHOP SELLS (16 November 2026) ──────────────────────────

  "Antar / Jemput" is one way — and which way (Jemput or Antar) is a small
  toggle under it, for the two addresses and the driver, never the price.
  "Antar + Jemput" is there and back: one package price from the service's
  "Perjalanan" variant, saved as two rides that carry half each.
*/
export type TripChoice = "one_way" | "round_trip";

export const TRIP_CHOICES: { value: TripChoice; label: string; hint: string }[] = [
  { value: "one_way", label: "Antar / Jemput", hint: "Sekali jalan — 1 booking" },
  { value: "round_trip", label: "Antar + Jemput", hint: "Jemput lalu antar — 2 booking, harga paket" },
];

export function tripChoiceOf(choice: LegChoice): TripChoice {
  return choice === "both" ? "round_trip" : "one_way";
}

export function otherLeg(leg: TripLeg): TripLeg {
  return leg === "pickup" ? "delivery" : "pickup";
}

/** The legs one save makes, in the order they are saved. */
export function legsOf(choice: LegChoice): TripLeg[] {
  return choice === "both" ? ["pickup", "delivery"] : [choice];
}

/* ─── The clock: every half hour ──────────────────────────────────────────── */

/** "00:00", "00:30" … "23:30" — BO's note 8: a time is picked, never typed. */
export const TIME_SLOTS: readonly string[] = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  return `${String(hours).padStart(2, "0")}:${index % 2 ? "30" : "00"}`;
});

/** The slot at or after this moment — a counter booking is for later, never earlier. */
export function slotAtOrAfter(at: Date): string {
  const minutes = at.getHours() * 60 + at.getMinutes() + (at.getSeconds() > 0 ? 1 : 0);
  const slot = Math.ceil(minutes / 30);
  return TIME_SLOTS[Math.min(slot, TIME_SLOTS.length - 1)];
}

/** The slot at or before this moment — a van leaves before the appointment. */
export function slotAtOrBefore(at: Date): string {
  const slot = Math.floor((at.getHours() * 60 + at.getMinutes()) / 30);
  return TIME_SLOTS[Math.max(0, Math.min(slot, TIME_SLOTS.length - 1))];
}

/** A stored time that is not on a half hour still reads as its slot, not blank. */
export function asSlot(time: string): string {
  if (TIME_SLOTS.includes(time)) return time;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return slotAtOrBefore(new Date(2000, 0, 1, hours, minutes));
}

/* ─── The trip card ("Perjalanan") ────────────────────────────────────────── */

/** The trip card's two codes — mirrors TRIP_CODES on the server. */
export const TRIP_CODES = { oneWay: "one_way", roundTrip: "round_trip" } as const;

const PICKUP_WORDS = ["jemput", "pickup", "pick up", "pick-up"];
const DELIVERY_WORDS = ["antar", "deliver", "pulang", "drop"];

function saysOnly(text: string, words: string[], others: string[]): boolean {
  const lower = text.trim().toLowerCase();
  return words.some((word) => lower.includes(word)) && !others.some((word) => lower.includes(word));
}

/**
 * AN OLD OWNER-MADE "ARAH" CARD'S CODES (21 September 2026 – 16 November
 * 2026) — read by its words. Kept only so a service not yet moved by
 * `seed:trip-card` still prices until the migration runs.
 */
function legacyLegValues(card: VariantOption): Partial<Record<TripLeg, string>> {
  const found: Partial<Record<TripLeg, string>> = {};
  if (card.systemKey) return found;

  for (const value of card.values) {
    const text = `${value.label} ${value.code}`;
    if (!found.pickup && saysOnly(text, PICKUP_WORDS, DELIVERY_WORDS)) found.pickup = value.code;
    if (!found.delivery && saysOnly(text, DELIVERY_WORDS, PICKUP_WORDS)) found.delivery = value.code;
  }

  return found;
}

export type ArahCard =
  | { kind: "trip"; card: VariantOption }
  | { kind: "legacy"; card: VariantOption; codes: Record<TripLeg, string> };

/**
 * THE CARD THE TRIP ANSWERS — the system "Perjalanan" card when the service is
 * priced by it, else (until migrated) an old "Arah" card. Null when neither:
 * the ride is then priced without one.
 *
 * Either way it is answered from the trip chosen, never asked as a select.
 */
export function arahCardOf(
  service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined,
  cards: readonly VariantOption[],
): ArahCard | null {
  const declared = staffAxesOf(service);
  const mine = cards.filter((card) => declared.includes(card.axisKey));

  const trip = mine.find((card) => card.systemKey === "trip");
  if (trip) return { kind: "trip", card: trip };

  for (const card of mine) {
    const codes = legacyLegValues(card);
    if (codes.pickup && codes.delivery) {
      return { kind: "legacy", card, codes: { pickup: codes.pickup, delivery: codes.delivery } };
    }
  }

  return null;
}

/**
 * The staff's choices with the trip card answered: `round_trip` for a ride of
 * an "Antar + Jemput", `one_way` otherwise (an old Arah card: this leg's value).
 */
export function choicesForLeg(
  service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined,
  cards: readonly VariantOption[],
  leg: TripLeg,
  choices: readonly VariantChoice[],
  roundTrip = false,
): VariantChoice[] {
  const arah = arahCardOf(service, cards);
  if (!arah) return [...choices];

  const code =
    arah.kind === "trip"
      ? roundTrip
        ? TRIP_CODES.roundTrip
        : TRIP_CODES.oneWay
      : arah.codes[leg];

  return [
    ...choices.filter((choice) => choice.optionId !== arah.card.axisKey),
    { optionId: arah.card.axisKey, code },
  ];
}

/**
 * WHAT ONE RIDE OF A ROUND TRIP CARRIES — half the package, in whole rupiah,
 * the pickup taking the odd one. Mirrors `roundTripShare` on the server, so the
 * form shows the figure the booking will store. `price` unchanged on a one-way
 * ride, or when the service is not priced by the trip card.
 */
export function rideShare(
  price: string | null,
  leg: TripLeg,
  { roundTrip, priced }: { roundTrip: boolean; priced: boolean },
): string | null {
  if (!roundTrip || !priced || price === null) return price;
  const minor = toMinor(price);
  if (minor === null) return price;

  const perRupiah = BigInt(10000);
  const rupiah = minor / perRupiah;
  const leftover = minor % perRupiah;
  const pickupRupiah = rupiah - rupiah / BigInt(2);
  const share =
    leg === "pickup" ? pickupRupiah * perRupiah + leftover : (rupiah - pickupRupiah) * perRupiah;

  return toDecimalString(share);
}

/* ─── A ride on the board ─────────────────────────────────────────────────── */

export interface RideFacts {
  leg: TripLeg | null;
  /** Where it starts and where it ends, in the order the van drives them. */
  from: string | null;
  to: string | null;
  /**
   * THE CUSTOMER'S END, for a row with space for one address only: where a
   * pickup starts, where a delivery finishes.
   */
  address: string | null;
  /** Every animal in the van. */
  animals: number;
  /** Their names, in the order the van lists them. */
  names: string[];
}

export function rideOf(
  booking: Pick<
    Booking,
    "tripLeg" | "tripAddress" | "tripOrigin" | "tripDestination" | "passengers"
  >,
): RideFacts {
  const passengers = booking.passengers ?? [];
  const leg = booking.tripLeg ?? null;
  /* Rides written before the two ends existed kept the customer's in `tripAddress`. */
  const from = booking.tripOrigin?.address ?? (leg === "pickup" ? booking.tripAddress : null);
  const to = booking.tripDestination?.address ?? (leg === "delivery" ? booking.tripAddress : null);

  return {
    leg,
    from: from ?? null,
    to: to ?? null,
    address: (leg === "delivery" ? to : from) ?? null,
    /*
      ⚠️ `passengers` IS THE WHOLE VAN (23 September 2026), not "the others".
      This used to add one for the booking's own animal and put `petName` at the
      front of the names; a ride has neither now, so the old arithmetic counted
      an animal that is not there.
    */
    animals: passengers.length,
    names: passengers
      .map((pet) => pet.name)
      .filter((name): name is string => Boolean(name)),
  };
}

/**
 * WHICH END OF A TRIP IS THE CUSTOMER'S, by direction — a pickup starts at
 * their door and a delivery finishes there.
 *
 * It is only the DEFAULT the form fills in. Both ends are editable, because a
 * van may start at another branch or at a groomer's house (23 September 2026),
 * which is why the booking stores both rather than inferring one.
 */
export function customerEndOf(leg: TripLeg): "origin" | "destination" {
  return leg === "pickup" ? "origin" : "destination";
}
