import type {
  Booking,
  Service,
  TripLeg,
  VariantChoice,
  VariantOption,
} from "@/types/api";
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

/* ─── The "Arah" card ─────────────────────────────────────────────────────── */

const PICKUP_WORDS = ["jemput", "pickup", "pick up", "pick-up"];
const DELIVERY_WORDS = ["antar", "deliver", "pulang", "drop"];

function saysOnly(text: string, words: string[], others: string[]): boolean {
  const lower = text.trim().toLowerCase();
  return words.some((word) => lower.includes(word)) && !others.some((word) => lower.includes(word));
}

/**
 * WHICH OF A CARD'S VALUES MEANS WHICH DIRECTION — by its words, since a
 * "Dipilih staf" card is the owner's own (Opsi Varian, 17 September 2026). A
 * value reading both ("Antar-Jemput") means neither.
 */
function legValues(card: VariantOption): Partial<Record<TripLeg, string>> {
  const found: Partial<Record<TripLeg, string>> = {};

  for (const value of card.values) {
    const text = `${value.label} ${value.code}`;
    if (!found.pickup && saysOnly(text, PICKUP_WORDS, DELIVERY_WORDS)) found.pickup = value.code;
    if (!found.delivery && saysOnly(text, DELIVERY_WORDS, PICKUP_WORDS)) found.delivery = value.code;
  }

  return found;
}

/**
 * THE SERVICE'S "ARAH" CARD — the first "Dipilih staf" card it is priced by that
 * has a value for each direction. Null when it has none: the ride is then priced
 * without one, and its direction is only the booking's own `tripLeg`.
 *
 * BO's decision (21 September 2026): Arah is an owner's variant option, so its
 * price comes from Layanan & Harga like any other — and the form fills it from
 * the direction chosen rather than asking twice.
 */
export function arahCardOf(
  service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined,
  cards: readonly VariantOption[],
): { card: VariantOption; codes: Record<TripLeg, string> } | null {
  const declared = staffAxesOf(service);

  for (const card of cards) {
    if (!declared.includes(card.axisKey)) continue;
    const codes = legValues(card);
    if (codes.pickup && codes.delivery) {
      return { card, codes: { pickup: codes.pickup, delivery: codes.delivery } };
    }
  }

  return null;
}

/** The staff's choices with the Arah card answered for this leg. */
export function choicesForLeg(
  service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined,
  cards: readonly VariantOption[],
  leg: TripLeg,
  choices: readonly VariantChoice[],
): VariantChoice[] {
  const arah = arahCardOf(service, cards);
  if (!arah) return [...choices];

  return [
    ...choices.filter((choice) => choice.optionId !== arah.card.axisKey),
    { optionId: arah.card.axisKey, code: arah.codes[leg] },
  ];
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
