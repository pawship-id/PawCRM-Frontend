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
 * what this file sends on save is exactly what the radio shows.
 */

/** Where an entry's prices come from — the form's own quote of each line. */
export interface EntryPrices {
  amount: string;
  addons: { serviceId: string; amount: string }[];
}

/** The pick a card sends to the quote — pinned plan, "Tanpa member", or nothing. */
function pickFields(card: BookingCardDraft): Partial<BookingBenefitQuoteEntry> {
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
 * needs the amount to say what a benefit is worth. ADD-ONS ARE SENT AS
 * `noBenefit`: a booking's plan is for its main service only (§10, the till
 * never hands it to an add-on), and an add-on quietly taking a jatah would
 * starve the next card's main service.
 */
export function bookingQuoteInput({
  cards,
  customerId,
  date,
  bookingId,
  pricesOf,
  visitFee,
}: {
  cards: BookingCardDraft[];
  customerId: string | null;
  /** The booking's `scheduledAt`, as an ISO instant. */
  date: string | null;
  bookingId?: string | null;
  pricesOf: (card: BookingCardDraft) => EntryPrices | null;
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
        ? { addons: prices.addons.map((addon) => ({ ...addon, noBenefit: true })) }
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

/** A candidate's identity, for the radio. */
export const candidateKey = (
  candidate: Pick<BenefitCandidate, "membershipId" | "benefitId">,
): string => `${candidate.membershipId}|${candidate.benefitId}`;

/** The main line of one card, if the quote has it. */
export function mainLineOf(
  quote: BenefitQuoteResponse | null,
  card: BookingCardDraft,
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

const toPlan = (candidate: BenefitCandidate): PlannedBenefit => ({
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
  card: BookingCardDraft,
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
 * server no longer validates it, and the radio is locked.
 */
export function effectivePlan(
  card: BookingCardDraft,
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

/** "Jatah Grooming habis periode ini · dipakai BK-…" — one unavailable benefit, said. */
export function unavailableText(item: BenefitQuoteUnavailable): string {
  const base = item.message ?? `${item.benefitLabel} tidak bisa dipakai`;
  const holders = holdersText(item.reservedBy);
  return holders && !base.includes(holders) ? `${base} · dipakai ${holders}` : base;
}

/** What one card's benefit field draws. */
export interface CardBenefitView {
  /** False hides the field — the animal holds no card at all. */
  show: boolean;
  candidates: BenefitCandidate[];
  /** The selected radio: a candidate key, or `null` for "Tanpa member". */
  selectedKey: string | null;
  /** Why nothing is offered, when nothing is. */
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
  card: BookingCardDraft,
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
    emptyMessage:
      candidates.length > 0
        ? null
        : unavailable.length > 0
          ? unavailableText(unavailable[0])
          : "Tidak ada benefit untuk layanan ini",
    discount: selected?.discount ?? "0",
    appliedLabel: selected?.label ?? null,
    feeWaived: selected?.visitFee === "free",
  };
}

/** The waived visit fee, "0" when nothing waived it. */
export function visitFeeDiscountOf(quote: BenefitQuoteResponse | null): string {
  return visitLineOf(quote)?.visitFeeDiscount ?? "0";
}

/** Σ every card's membership discount — what comes off the form's total. */
export function membershipDiscountTotal(
  cards: BookingCardDraft[],
  quote: BenefitQuoteResponse | null,
): string {
  return sumDecimals(cards.map((card) => cardBenefitView(card, quote).discount));
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
  const data = (error.data ?? null) as { reservedBy?: MembershipReservation[] } | null;
  const holders = holdersText(data?.reservedBy);
  const base = detail.message || error.reason || error.message;

  return {
    index: match ? Number(match[1]) : null,
    message: holders && !base.includes(holders) ? `${base} · dipakai ${holders}` : base,
  };
}
