import { isPositive, subtractDecimals } from "@/utils/decimal";
import type { PosBenefitPick, PosItem, PosTransaction } from "@/types/api";
import type {
  BenefitCandidate,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
} from "@/types/membership";
import type {
  PromoQuoteInput,
  PromoQuoteLine,
  PromoQuoteLineInput,
  PromoQuoteResponse,
} from "@/types/promo";

import { bookingShareOf } from "./bookingDiscount";
import {
  candidateKey,
  candidatePick,
  isFeeLine,
  lineKey,
  matchesBooking,
  pickKey,
  pickOf,
  quoteLineFor,
} from "./membershipCart";

/**
 * ─── PROMO IN THE BASKET (Promo V1, 8 November 2026) ──────────────────────
 *
 * Pure helpers behind the till's combined "potongan" select — Jatah (a card's
 * quota), Member (a card's unlimited benefit), Promo, or Tanpa potongan.
 *
 * THE SERVER PRICES EVERYTHING. A line sends `benefit` (which card) and
 * `promoIds` (which promos: absent = automatic, `[]` = none); every figure on
 * screen is read back from the cart. The quote (`POST /promos/quote`) is only
 * asked so the select can OFFER the promos and so the till can tell when a
 * promo beats the card's unlimited benefit (`recommended.useMember: false`).
 *
 * THE RULES (BO, contract): a line spending a jatah takes no promo; an
 * unlimited member benefit competes with promos — only a "bisa digabung"
 * promo rides on top of it. Offline no promo applies at all.
 */

/* ───────────────────────────────────────────────────── what a card offers */

/**
 * The membership benefit a line is offered right now — the candidate it
 * carries, else the member quote's recommendation. Null when no card acts.
 */
export function memberOfferOf(
  item: PosItem,
  memberLine: BenefitQuoteLineResult | null,
): BenefitCandidate | null {
  const pick = pickOf(item);
  const candidates = memberLine?.candidates ?? [];
  if (pick) {
    return candidates.find((candidate) => candidateKey(candidate) === pickKey(pick)) ?? null;
  }
  return memberLine?.recommended ?? null;
}

/** Whether a line can carry a promo at all — goods and services, not fees. */
export function promoEligible(item: PosItem): boolean {
  return (item.kind === "product" || item.kind === "service") && !isFeeLine(item);
}

/* ───────────────────────────────────────────────────────── the quote ask */

/**
 * The promo quote for this basket, or null when there is nothing to ask.
 *
 * `ref` IS THE LINE'S INDEX, like the member quote. `amount` is what is left
 * after the booking's share (the jatah/benefit is described by `member`, not
 * taken off here — the engine compares the two).
 */
export function buildPromoQuoteInput(
  cart: Pick<PosTransaction, "customerId" | "branchId" | "items"> | null,
  memberQuote: BenefitQuoteResponse | null,
): PromoQuoteInput | null {
  if (!cart) return null;
  const items = cart.items ?? [];

  const lines: PromoQuoteLineInput[] = items.flatMap((item, index) => {
    if (!promoEligible(item)) return [];

    const share = bookingShareOf(item);
    const amount = share ? subtractDecimals(item.lineTotal, share) : item.lineTotal;
    if (!isPositive(amount)) return [];

    const offer = memberOfferOf(item, quoteLineFor(memberQuote, index));

    return [
      {
        ref: String(index),
        kind: item.kind as "product" | "service",
        refId: item.refId,
        petId: item.petId ?? null,
        qty: item.qty,
        amount,
        member: offer ? { kind: offer.kind, discount: offer.discount } : null,
      },
    ];
  });

  if (lines.length === 0) return null;

  return {
    channel: "pos",
    branchId: cart.branchId ?? null,
    customerId: cart.customerId ?? null,
    lines,
  };
}

/** The promo quote line answering cart line `index`, or null. */
export function promoLineFor(
  quote: PromoQuoteResponse | null,
  index: number,
): PromoQuoteLine | null {
  return quote?.lines?.find((line) => line.ref === String(index)) ?? null;
}

/* ──────────────────────────────────────────────── the combined recommendation */

/**
 * LINES WHERE A PROMO BEATS THE CARD'S UNLIMITED BENEFIT — the member pick is
 * dropped and the winning promo named (`promoIds`), which also keeps the
 * member auto-apply off the line from then on (`promoDecided`).
 *
 * Only lines nobody decided for: the promo choice is still automatic
 * (`promoPick` null), the cashier has not touched the line's select
 * (`chosenKeys`), and the pick is not the one its booking agreed. A jatah is
 * never swapped (the engine always keeps it: `useMember` true).
 */
export function promoSwitches(
  items: PosItem[],
  memberQuote: BenefitQuoteResponse | null,
  promoQuote: PromoQuoteResponse | null,
  chosenKeys: ReadonlySet<string> = new Set(),
): Array<{ index: number; promoIds: string[] }> {
  if (!promoQuote) return [];

  return items.flatMap((item, index) => {
    if (!promoEligible(item)) return [];
    if (Array.isArray(item.promoPick)) return [];
    if (chosenKeys.has(lineKey(items, index))) return [];

    const pick = pickOf(item);
    if (!pick || matchesBooking(item)) return [];

    const offer = memberOfferOf(item, quoteLineFor(memberQuote, index));
    if (!offer || offer.kind !== "unlimited") return [];

    const line = promoLineFor(promoQuote, index);
    if (!line || line.recommended.useMember || line.recommended.promoIds.length === 0) {
      return [];
    }

    return [{ index, promoIds: line.recommended.promoIds }];
  });
}

/**
 * Whether the member auto-apply must leave a line alone: the cashier already
 * chose its promo (a promo, or "Tanpa potongan") — `promoPick` is kept on the
 * cart, so this holds across a resumed basket.
 */
export function promoDecided(item: PosItem): boolean {
  return Array.isArray(item.promoPick) && pickOf(item) === null;
}

/* ─────────────────────────────────────────────────────── the select itself */

export type PotonganTone = "member" | "promo" | "none";

export interface PotonganOption {
  value: string;
  label: string;
  tone: PotonganTone;
}

/** Radix Select forbids `value=""`, so "Tanpa potongan" needs a value of its own. */
export const POTONGAN_NONE = "none";

const memberValue = (key: string) => `m:${key}`;
const promoValue = (promoId: string) => `p:${promoId}`;

/**
 * "Flash Sale −12%" — the promo's name and its cut, once.
 *
 * THE SERVER'S `label` ALREADY STARTS WITH THE NAME ("Flash Sale −12%"), so
 * joining the two printed it twice — "Flash Sale Flash Sale −12%". A label
 * that does not repeat the name (an older document) still gets it in front.
 */
function promoText(part: { name: string | null; label: string | null }): string {
  const name = part.name?.trim() ?? "";
  const label = part.label?.trim() ?? "";
  if (!label) return name;
  if (!name || label.startsWith(name)) return label;
  return `${name} ${label}`;
}

/** "Promo · Flash Sale −12%". */
export function promoOptionLabel(part: { name: string | null; label: string | null }): string {
  return `Promo · ${promoText(part)}`;
}

/**
 * "Promo · Shampoo 20% −20% + Flash Sale −12%" — several "bisa digabung"
 * promos applied one after another on one line.
 */
export function combinedPromoLabel(parts: Array<{ name: string | null; label: string | null }>): string {
  return `Promo · ${parts.map(promoText).join(" + ")}`;
}

/**
 * ONE VALUE FOR A SET OF PROMOS, whatever order they are listed in — the line
 * the server priced and the option the quote offered must read as the same
 * choice. The ORDER they are applied in travels separately (see
 * `potonganChange`).
 */
const promosValue = (promoIds: string[]) =>
  promoIds.length === 1 ? promoValue(promoIds[0]) : promoValue([...promoIds].sort().join(","));

/** What the select shows as chosen right now. */
export function potonganValue(item: PosItem): string {
  const pick = pickOf(item);
  if (pick) return memberValue(pickKey(pick));
  const promos = item.promos ?? [];
  if (promos.length) return promosValue(promos.map((promo) => String(promo.promoId)));
  return POTONGAN_NONE;
}

/**
 * The options of one line's select: card benefits (Jatah / Member), then the
 * promos, then "Tanpa potongan". What the line carries is always among them,
 * even while a quote is in flight, so the select never reads "Tanpa potongan"
 * over a line something is paying for.
 */
export function potonganOptions(
  item: PosItem,
  memberLine: BenefitQuoteLineResult | null,
  promoLine: PromoQuoteLine | null,
  { promosAllowed = true }: { promosAllowed?: boolean } = {},
): PotonganOption[] {
  const options: PotonganOption[] = [];
  const seen = new Set<string>();
  const push = (option: PotonganOption) => {
    if (seen.has(option.value)) return;
    seen.add(option.value);
    options.push(option);
  };

  for (const candidate of memberLine?.candidates ?? []) {
    push({ value: memberValue(candidateKey(candidate)), label: candidate.label, tone: "member" });
  }

  const pick = pickOf(item);
  if (pick) {
    push({
      value: memberValue(pickKey(pick)),
      label: item.discount?.benefitLabel ?? "Member",
      tone: "member",
    });
  }

  /*
    THE PROMOS STACKED, as one option, ahead of each promo alone. Without it a
    line could only ever be pinned to ONE promo, so two "bisa digabung" promos
    were combined only while nobody had touched the select — and once a cashier
    picked either, there was no way back to both.
  */
  const stackable = (promoLine?.candidates ?? []).filter((part) => part.stackable);
  if (promosAllowed && stackable.length > 1) {
    push({
      value: promosValue(stackable.map((part) => part.promoId)),
      label: combinedPromoLabel(stackable),
      tone: "promo",
    });
  }

  if (promosAllowed) {
    for (const part of promoLine?.candidates ?? []) {
      push({ value: promoValue(part.promoId), label: promoOptionLabel(part), tone: "promo" });
    }
  }

  /* The promo on the line — riding on a card or not — is always offered. */
  if (!pick) {
    const onLine = item.promos ?? [];
    if (onLine.length > 1) {
      push({
        value: promosValue(onLine.map((promo) => String(promo.promoId))),
        label: combinedPromoLabel(onLine),
        tone: "promo",
      });
    }
    for (const promo of onLine) {
      push({ value: promoValue(String(promo.promoId)), label: promoOptionLabel(promo), tone: "promo" });
    }
  }

  push({ value: POTONGAN_NONE, label: "Tanpa potongan", tone: "none" });
  return options;
}

/** What choosing one option writes on the line. */
export interface PotonganChange {
  /** The card pick, or null for none. */
  benefit: PosBenefitPick | null;
  /** `null` = automatic (a "bisa digabung" promo may ride on the card). */
  promoIds: string[] | null;
  /** Remember the line as "Tanpa member" so the auto-apply leaves it alone. */
  noBenefit: boolean;
}

/**
 * Turns a chosen option into the write.
 *
 *   Promo           → `promoIds: [id]`, no card.
 *   Promo gabungan  → `promoIds: [a, b]`, no card — in the order the quote
 *                     lists them (largest cut first, as the server would).
 *   Jatah           → the card, `promoIds: []` (a jatah line takes no promo).
 *   Member          → the card, promo AUTOMATIC: the server lets only a
 *                     "bisa digabung" promo ride on an unlimited benefit.
 *   Tanpa potongan  → no card, `promoIds: []`.
 *
 * Null when the value names nothing the line can take.
 */
export function potonganChange(
  value: string,
  memberLine: BenefitQuoteLineResult | null,
  promoLine: PromoQuoteLine | null = null,
): PotonganChange | null {
  if (value === POTONGAN_NONE) return { benefit: null, promoIds: [], noBenefit: true };

  if (value.startsWith("p:")) {
    const ids = value.slice(2).split(",").filter(Boolean);
    /*
      The value is sorted to be stable; the server applies promos in the
      order it is sent, so put them back in the quote's (largest first).
    */
    const order = (promoLine?.candidates ?? []).map((part) => part.promoId);
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
    ids.sort((a, b) => rank(a) - rank(b));
    return { benefit: null, promoIds: ids, noBenefit: true };
  }

  if (value.startsWith("m:")) {
    const key = value.slice(2);
    const candidate = (memberLine?.candidates ?? []).find((entry) => candidateKey(entry) === key);
    if (!candidate) return null;
    return {
      benefit: candidatePick(candidate),
      promoIds: candidate.kind === "quota" ? [] : null,
      noBenefit: false,
    };
  }

  return null;
}

/** The tone of an option value, for the trigger's tint. */
export function toneOfValue(value: string): PotonganTone {
  if (value.startsWith("m:")) return "member";
  if (value.startsWith("p:")) return "promo";
  return "none";
}

/* ──────────────────────────────────────────────────────────── the catalogue */

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

/**
 * The tile's tag: "−12%", or "Sen −15%" / "Sen, Rab −15%" when the promo runs
 * on some days only. Every day (or none listed) needs no day.
 */
export function catalogTagLabel(tag: { label: string; weekdays: number[] }): string {
  const days = [...new Set(tag.weekdays ?? [])]
    .filter((day) => day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0 || days.length === 7) return tag.label;
  return `${days.map((day) => DAY_SHORT[day]).join(", ")} ${tag.label}`;
}
