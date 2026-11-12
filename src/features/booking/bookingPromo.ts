import type { BenefitQuoteResponse, BookingBenefitQuoteInput } from "@/types/membership";
import type { PromoQuoteInput, PromoQuoteLineInput, PromoQuoteResponse } from "@/types/promo";
import { isPositive, sumDecimals } from "@/utils/decimal";

import {
  addonBenefitsOf,
  candidateKey,
  cardBenefitView,
  type BenefitCardState,
  type EntryPrices,
} from "./benefitQuote";

/**
 * ─── PROMO ON A BOOKING (Promo V1, 8 November 2026) ───────────────────────
 *
 * DISPLAY-ONLY. A booking stores no promo: it is re-evaluated at the till on
 * the day it is paid (BO decision — the booking's service date decides which
 * promo runs, and the till's own rules decide whether it applies). The form
 * asks `POST /promos/quote` with `channel: "booking"` and `at` = the service
 * date/time only to show the customer what the promo would take off.
 *
 * WHAT THE TILL WILL DO, mirrored:
 *   - "Tanpa member" (no card benefit) → the best promo.
 *   - an unlimited member benefit → only "bisa digabung" promos ride on it
 *     (`recommended` with `useMember: true`).
 *   - a jatah → no promo.
 *   - a promo that BEATS the unlimited benefit (`useMember: false`) is NOT
 *     counted — the booking keeps its member pick and the till honours it —
 *     but it is named, so whoever fills the form can choose "Tanpa member".
 */

/** The add-on line's ref — the card's key and the add-on's service. */
const addonRef = (card: BenefitCardState, serviceId: string) => `${card.key}:addon:${serviceId}`;

export function bookingPromoInput<Card extends BenefitCardState>({
  cards,
  customerId,
  branchId,
  at,
  pricesOf,
  memberQuote,
  memberAsked,
}: {
  cards: Card[];
  customerId: string | null;
  branchId: string | null;
  /** The booking's `scheduledAt`, as an ISO instant. */
  at: string | null;
  pricesOf: (card: Card) => EntryPrices | null;
  memberQuote: BenefitQuoteResponse | null;
  /** The request `memberQuote` answered — add-on lines are read against it. */
  memberAsked: BookingBenefitQuoteInput | null;
}): PromoQuoteInput | null {
  if (!at) return null;

  const lines: PromoQuoteLineInput[] = [];

  for (const card of cards) {
    if (card.locked || card.petId === "" || card.serviceId === "") continue;
    const prices = pricesOf(card);
    if (!prices || !isPositive(prices.amount)) continue;

    const view = cardBenefitView(card, memberQuote);
    const selected =
      view.candidates.find((candidate) => candidateKey(candidate) === view.selectedKey) ?? null;

    lines.push({
      ref: card.key,
      kind: "service",
      refId: card.serviceId,
      petId: card.petId,
      qty: "1",
      amount: prices.amount,
      member: selected ? { kind: selected.kind, discount: selected.discount } : null,
    });

    const addonMembers = addonBenefitsOf(card, memberQuote, memberAsked);
    for (const addon of prices.addons) {
      if (!isPositive(addon.amount)) continue;
      const member = addonMembers[addon.serviceId];
      lines.push({
        ref: addonRef(card, addon.serviceId),
        kind: "service",
        refId: addon.serviceId,
        petId: card.petId,
        qty: "1",
        amount: addon.amount,
        member:
          member && !member.optedOut && isPositive(member.discount)
            ? { kind: member.quota ? "quota" : "unlimited", discount: member.discount }
            : null,
      });
    }
  }

  if (lines.length === 0) return null;

  return {
    channel: "booking",
    branchId,
    customerId,
    at,
    lines,
  };
}

export interface BookingPromoView {
  /** Σ what the promos take off — "0" when nothing applies. */
  discount: string;
  /** The promos counted, each once — "Flash Sale". */
  names: string[];
  /** Promos that would beat a member benefit kept on the booking. */
  beatenBy: string[];
  /** Per line ref (card key, or `<key>:addon:<serviceId>`): what comes off. */
  byRef: Record<string, string>;
}

const NO_PROMO: BookingPromoView = { discount: "0", names: [], beatenBy: [], byRef: {} };

/** What the promo quote means for the booking's totals — see the file note. */
export function bookingPromoView(
  input: PromoQuoteInput | null,
  quote: PromoQuoteResponse | null,
): BookingPromoView {
  if (!input || !quote) return NO_PROMO;

  const names = new Set<string>();
  const beatenBy = new Set<string>();
  const byRef: Record<string, string> = {};
  const offs: string[] = [];

  for (const line of input.lines) {
    const answer = quote.lines.find((entry) => entry.ref === line.ref);
    if (!answer) continue;
    const { recommended } = answer;

    if (line.member && !recommended.useMember) {
      for (const part of recommended.parts) beatenBy.add(part.name);
      continue;
    }
    if (line.member?.kind === "quota") continue;
    if (!isPositive(recommended.discount)) continue;

    offs.push(recommended.discount);
    byRef[line.ref] = recommended.discount;
    for (const part of recommended.parts) names.add(part.name);
  }

  return {
    discount: offs.length > 0 ? sumDecimals(offs) : "0",
    names: [...names],
    beatenBy: [...beatenBy].filter((name) => !names.has(name)),
    byRef,
  };
}

/** "Potongan promo · Flash Sale" — the summary row's label. */
export function promoRowLabel(view: Pick<BookingPromoView, "names">): string {
  return view.names.length > 0 ? `Potongan promo · ${view.names.join(", ")}` : "Potongan promo";
}
