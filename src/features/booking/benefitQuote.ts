import { ApiError } from "@/services/api-error";
import type { PlannedBenefit } from "@/types/api";
import type {
  BenefitCandidate,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
  BenefitQuoteUnavailable,
  BookingBenefitQuoteEntry,
  BookingBenefitQuoteInput,
  MembershipReservation,
} from "@/types/membership";
import { isPositive, sumDecimals } from "@/utils/decimal";

import type { BookingCardDraft } from "./bookingDraft";

/**
 * WHAT THE QUOTE NEEDS FROM ONE CARD — the slice of `BookingCardDraft` this file
 * reads, so a form with its own draft shape (Layanan › Grooming › Booking baru,
 * one card per animal keyed by the animal) asks the same question and draws the
 * same field without copying any of this.
 */
export type BenefitCardState = Pick<
  BookingCardDraft,
  "key" | "petId" | "serviceId" | "benefitPicked" | "plannedBenefit"
> & {
  /** Already billed — keeps what it stored. Absent on a form that only creates. */
  locked?: boolean;
  /**
   * The ticked add-ons set to "Tanpa member" (22 October 2026) — sent to the
   * quote with `noBenefit: true`, left out of the totals, and saved as
   * `noMemberBenefitAddonIds`. Absent is none.
   */
  noMemberAddonIds?: readonly string[];
};

/** Whether this add-on of the card is set to "Tanpa member". */
export const addonOptedOut = (card: BenefitCardState, serviceId: string): boolean =>
  (card.noMemberAddonIds ?? []).includes(serviceId);

/**
 * THE BOOKING FORM'S MEMBERSHIP QUOTE — membership-v1 §4.4 and §8, pure.
 *
 * ─── THE SERVER CHOOSES, THE FORM ASKS ─────────────────────────────────────
 *
 * One quote for the whole form, one entry per card: the cards compete for the
 * same jatah (two dogs on a 1×/bulan bath — only the first gets it), and only
 * the engine knows the scope, the holds of other bookings and the period of the
 * booking's own date. The form sends what each card picked and reads back
 * `recommended` — which is the pick while it is still a candidate, the first
 * candidate when nobody picked or the pick stopped fitting, and nothing on
 * "Tanpa member". That is the whole "default pick" and "reset an invalid pick"
 * rule, and it lives on the server.
 *
 * ─── IT HOLDS THE QUOTA NOW ────────────────────────────────────────────────
 *
 * Since Promosi V1 a saved `plannedBenefit` is a HOLD: counted as used in the
 * period of the booking's date until the booking is billed or cancelled. So
 * what this file sends on save is exactly what the main service's price row
 * shows (`BookingBenefitField`).
 */

/** Where an entry's prices come from — the form's own quote of each line. */
export interface EntryPrices {
  amount: string;
  addons: { serviceId: string; amount: string }[];
}

/** The pick a card sends to the quote — pinned plan, "Tanpa member", or nothing. */
function pickFields(card: BenefitCardState): Partial<BookingBenefitQuoteEntry> {
  if (!card.benefitPicked) return {};
  if (!card.plannedBenefit) return { noBenefit: true };
  return {
    membershipId: card.plannedBenefit.membershipId,
    benefitId: card.plannedBenefit.benefitId,
    optionId: card.plannedBenefit.optionId ?? null,
  };
}

/**
 * The form → the §4.4 request, or null when there is nothing to ask about.
 *
 * A card without an animal, a service or a price is left out — the engine
 * needs the amount to say what a benefit is worth.
 *
 * ADD-ONS ARE SENT WITH NO PICK (22 October 2026), so the engine recommends
 * one per add-on line — "Add-on · Diskon 10%", "Spa 1× per bulan" — and the
 * form can show it (`addonBenefitsOf`). No pick is saved for an add-on (the
 * booking's `plannedBenefit` is the main service's) and the till applies it
 * when the booking is billed — UNLESS the add-on is set to "Tanpa member":
 * it is then sent with `noBenefit: true`, saved as `noMemberBenefit` on the
 * booking's add-on, and the till starts that line on "Tanpa member".
 * The server quotes every main service before any add-on, so an add-on never
 * takes a jatah a main service — this card's or the next one's — would use.
 */
export function bookingQuoteInput<Card extends BenefitCardState>({
  cards,
  customerId,
  date,
  bookingId,
  pricesOf,
  visitFee,
}: {
  cards: Card[];
  customerId: string | null;
  /** The booking's `scheduledAt`, as an ISO instant. */
  date: string | null;
  bookingId?: string | null;
  pricesOf: (card: Card) => EntryPrices | null;
  /** The visit's fee on a house call — one visit for everything saved together. */
  visitFee?: string | null;
}): BookingBenefitQuoteInput | null {
  if (!customerId || !date) return null;

  const entries: BookingBenefitQuoteEntry[] = [];

  for (const card of cards) {
    if (card.petId === "" || card.serviceId === "") continue;
    const prices = pricesOf(card);
    if (!prices) continue;

    entries.push({
      ref: card.key,
      petId: card.petId,
      serviceId: card.serviceId,
      amount: prices.amount,
      ...(prices.addons.length > 0
        ? {
            addons: prices.addons.map((addon) => ({
              ...addon,
              ...(addonOptedOut(card, addon.serviceId) ? { noBenefit: true } : {}),
            })),
          }
        : {}),
      ...(visitFee && isPositive(visitFee)
        ? { visitGroup: "visit", ...(entries.length === 0 ? { visitFee } : {}) }
        : {}),
      ...pickFields(card),
    });
  }

  if (entries.length === 0) return null;

  return {
    context: "booking",
    customerId,
    date,
    ...(bookingId ? { bookingId } : {}),
    entries,
  };
}

/** A candidate's identity, for the main service's select. */
export const candidateKey = (
  candidate: Pick<BenefitCandidate, "membershipId" | "benefitId">,
): string => `${candidate.membershipId}|${candidate.benefitId}`;

/** The main line of one card, if the quote has it. */
export function mainLineOf(
  quote: BenefitQuoteResponse | null,
  card: BenefitCardState,
): BenefitQuoteLineResult | null {
  /* The pet too: a card keeps its key when its animal changes, and a quote
     still on screen from before must not dress the new animal in the old one's
     benefits. */
  return (
    quote?.lines.find((line) => line.ref === card.key && line.petId === card.petId) ?? null
  );
}

/** The visit-fee line, if the quote emitted one. */
export function visitLineOf(quote: BenefitQuoteResponse | null): BenefitQuoteLineResult | null {
  return quote?.lines.find((line) => line.lineType === "visit_fee") ?? null;
}

/** A candidate as the `plannedBenefit` a card holds and the save sends. */
export const toPlan = (candidate: BenefitCandidate): PlannedBenefit => ({
  membershipId: candidate.membershipId,
  benefitId: candidate.benefitId,
  optionId: candidate.optionId ?? null,
});

/**
 * THE CANDIDATE THIS CARD STANDS ON — the server's rule, applied to whichever
 * quote is on screen: the card's own pick while it is still a candidate,
 * nothing on "Tanpa member", otherwise the quote's `recommended` (the first
 * candidate). Read client-side too so a click shows at once, before the quote
 * that confirms it lands.
 */
function selectedCandidate(
  card: BenefitCardState,
  line: BenefitQuoteLineResult,
): BenefitCandidate | null {
  if (card.benefitPicked) {
    const pick = card.plannedBenefit;
    if (!pick) return null;
    const match = (line.candidates ?? []).find(
      (candidate) => candidateKey(candidate) === candidateKey(pick),
    );
    if (match) return match;
  }
  return line.recommended ?? null;
}

/**
 * WHAT THIS CARD WILL SAVE — the selected candidate when the quote has the
 * card, the card's own state otherwise (no quote yet, a quote that failed, a
 * card the quote could not price). A BILLED card keeps what it stored: the
 * server no longer validates it, and the control is locked.
 */
export function effectivePlan(
  card: BenefitCardState,
  quote: BenefitQuoteResponse | null,
): PlannedBenefit | null {
  if (card.locked) return card.plannedBenefit;
  const line = mainLineOf(quote, card);
  if (!line) return card.benefitPicked ? card.plannedBenefit : null;
  const selected = selectedCandidate(card, line);
  if (!selected) return null;
  /* The pick's own option when it was the one picked; else the candidate's best. */
  const picked =
    card.benefitPicked &&
    card.plannedBenefit &&
    candidateKey(card.plannedBenefit) === candidateKey(selected)
      ? card.plannedBenefit.optionId
      : null;
  return { ...toPlan(selected), optionId: picked ?? selected.optionId ?? null };
}

/** "BK-2026-0012, booking draft" — who holds a jatah. */
export function holdersText(reservedBy: readonly MembershipReservation[] | undefined): string | null {
  const names = (reservedBy ?? []).map((hold) => hold.bookingNumber ?? "booking draft");
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * "Jatah periode ini sudah habis" — one unavailable benefit, said. The holding
 * booking numbers are NOT listed (22 October 2026, on request): to the person
 * filling the form a jatah held by another booking is simply used up.
 */
export function unavailableText(item: BenefitQuoteUnavailable): string {
  return item.message ?? `${item.benefitLabel} tidak bisa dipakai`;
}

/** What one card's benefit field draws. */
export interface CardBenefitView {
  /** False hides the field — the animal holds no card at all. */
  show: boolean;
  candidates: BenefitCandidate[];
  /** The selected pick: a candidate key, or `null` for "Tanpa member". */
  selectedKey: string | null;
  /** Why nothing is offered although a card covers the service — else null. */
  emptyMessage: string | null;
  /** Off the main service. "0" when nothing applies. */
  discount: string;
  /** The applied candidate's label — "Jatah Grooming 1/3". */
  appliedLabel: string | null;
  /** The applied option waives the home visit's fee. */
  feeWaived: boolean;
}

const NO_VIEW: CardBenefitView = {
  show: false,
  candidates: [],
  selectedKey: null,
  emptyMessage: null,
  discount: "0",
  appliedLabel: null,
  feeWaived: false,
};

/** Cards that still mean something on the booking's day. */
const LIVE_STATUSES = new Set(["active", "paused", "scheduled", "awaiting_payment"]);

export function cardBenefitView(
  card: BenefitCardState,
  quote: BenefitQuoteResponse | null,
): CardBenefitView {
  const line = mainLineOf(quote, card);
  if (!quote || !line) return NO_VIEW;

  const candidates = line.candidates ?? [];
  const unavailable = line.unavailable ?? [];
  const holdsCard = quote.cards.some(
    (held) =>
      LIVE_STATUSES.has(held.status) &&
      (held.petId === card.petId || held.attachTo === "customer"),
  );

  if (candidates.length === 0 && unavailable.length === 0 && !holdsCard) return NO_VIEW;

  const selected = card.locked
    ? (candidates.find(
        (candidate) =>
          card.plannedBenefit !== null && candidateKey(candidate) === candidateKey(card.plannedBenefit),
      ) ?? null)
    : selectedCandidate(card, line);

  return {
    show: true,
    candidates,
    selectedKey: selected ? candidateKey(selected) : null,
    /*
      ONLY A BENEFIT THAT COVERS THIS SERVICE BUT CANNOT BE USED is said on the
      price row (22 October 2026) — jatah habis, dipesan booking lain, ditunda.
      A card that simply covers nothing here says nothing: what it holds
      beyond the booking is the "Benefit lain" box.
    */
    emptyMessage:
      candidates.length === 0 && unavailable.length > 0 ? unavailableText(unavailable[0]) : null,
    discount: selected?.discount ?? "0",
    appliedLabel: selected?.label ?? null,
    feeWaived: selected?.visitFee === "free",
  };
}

/**
 * ONE ADD-ON'S BENEFIT, as the quote recommends it — shown on the add-on's
 * price row and counted in the totals, never picked and never saved.
 */
export interface AddonBenefit {
  /** Off the add-on, as a decimal string. Always positive. */
  discount: string;
  /** The candidate's own label — "Member · Diskon 10%", "Jatah Spa 1/1". */
  label: string;
  /** Spends a jatah — the form says it is an estimate until the till. */
  quota: boolean;
  /**
   * Set to "Tanpa member" — `discount` is then "0", and `label` names the
   * benefit "Pakai member" would bring back.
   */
  optedOut: boolean;
}

const NO_ADDON_BENEFITS: Readonly<Record<string, AddonBenefit>> = Object.freeze({});

/**
 * EACH TICKED ADD-ON'S BENEFIT, by its service id.
 *
 * The quote names an add-on line by POSITION — `<ref>:addon:<i>` (§4.4) — so
 * the position is read against the request THAT QUOTE ANSWERED (`asked`, from
 * `useBookingBenefitQuote`), not against the form as it is now: while the next
 * quote is on its way the last one stays on screen, and an add-on ticked in
 * between must not wear its neighbour's discount. A billed card shows none —
 * what the till applied is on the bill, not in a quote.
 *
 * "TANPA MEMBER" IS READ OFF THE CARD AS IT IS NOW, so a click shows at once:
 * an opted-out add-on (quoted with no `recommended`) is named by its first
 * candidate, with nothing off. An add-on with no candidate is left out — there
 * is nothing to switch back to.
 */
export function addonBenefitsOf(
  card: BenefitCardState,
  quote: BenefitQuoteResponse | null,
  asked: BookingBenefitQuoteInput | null,
): Readonly<Record<string, AddonBenefit>> {
  if (!quote || !asked || card.locked) return NO_ADDON_BENEFITS;
  const entry = asked.entries.find(
    (item) => item.ref === card.key && item.petId === card.petId,
  );
  if (!entry?.addons?.length) return NO_ADDON_BENEFITS;

  const out: Record<string, AddonBenefit> = {};
  entry.addons.forEach((addon, index) => {
    const line = quote.lines.find(
      (item) => item.ref === `${card.key}:addon:${index}` && item.petId === card.petId,
    );
    const pick = line?.recommended ?? line?.candidates?.[0] ?? null;
    if (!pick || !isPositive(pick.discount)) return;
    const optedOut = addonOptedOut(card, addon.serviceId);
    out[addon.serviceId] = {
      discount: optedOut ? "0" : pick.discount,
      label: pick.label,
      quota: pick.kind === "quota",
      optedOut,
    };
  });
  return out;
}

/** Σ one card's add-on benefits. */
export function addonDiscountOf(
  card: BenefitCardState,
  quote: BenefitQuoteResponse | null,
  asked: BookingBenefitQuoteInput | null,
): string {
  return sumDecimals(Object.values(addonBenefitsOf(card, quote, asked)).map((item) => item.discount));
}

/** The waived visit fee, "0" when nothing waived it. */
export function visitFeeDiscountOf(quote: BenefitQuoteResponse | null): string {
  return visitLineOf(quote)?.visitFeeDiscount ?? "0";
}

/**
 * Σ every card's membership discount — what comes off the form's total: each
 * main service's pick, plus (given the request the quote answered) every
 * add-on's recommended benefit.
 */
export function membershipDiscountTotal(
  cards: BenefitCardState[],
  quote: BenefitQuoteResponse | null,
  asked: BookingBenefitQuoteInput | null = null,
): string {
  return sumDecimals(
    cards.flatMap((card) => [
      cardBenefitView(card, quote).discount,
      addonDiscountOf(card, quote, asked),
    ]),
  );
}

/** A save refused over a card's `plannedBenefit` (§8, 400 or 409). */
export interface BenefitRefusal {
  /** Index into the cards that were SENT; null on an update (one card). */
  index: number | null;
  message: string;
}

/**
 * `bookings[1].plannedBenefit` / `plannedBenefit` → which card, and the
 * sentence. Null when the refusal is about something else — a 409 that is NOT
 * about a benefit is the clash, and stays the clash.
 */
export function benefitRefusalOf(error: unknown): BenefitRefusal | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 400 && error.status !== 409) return null;

  const detail = (error.details ?? []).find(
    (entry) => entry && typeof entry.field === "string" && /plannedBenefit$/.test(entry.field),
  );
  if (!detail) return null;

  const match = /bookings\[(\d+)\]/.exec(detail.field) ?? /bookings\.(\d+)\./.exec(detail.field);
  const base = detail.message || error.reason || error.message;

  return {
    index: match ? Number(match[1]) : null,
    message: base,
  };
}
