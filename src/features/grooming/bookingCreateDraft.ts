import { divideRound, toMinor } from "@/utils/decimal";
import type {
  CreateBookingEntry,
  TypedDiscountInput,
} from "@/types/api";

/**
 * What the grooming booking form holds while somebody fills it in, and the
 * arithmetic it previews — from `buloo-booking-v2.html`, "Booking baru".
 *
 * ─── THE SERVER DECIDES; THIS ONLY PREVIEWS ────────────────────────────────
 *
 * Since 15 September 2026 a booking carries a typed price and discounts, and
 * the server prices them with `utils/discount.js` and `tax.allocate`. The
 * figures here follow the same rules — percent half-up and never past 100, a
 * nominal clamped to what it is taken from, the save's discount split evenly
 * across the bookings — so the rail agrees with the bill. The
 * payload sends what was TYPED, never a resolved amount.
 *
 * PURE: no React, no fetching. Every figure is in minor units (`bigint`, four
 * decimal places), the same as `utils/decimal`.
 */

export type DiscountMode = TypedDiscountInput["mode"];

/** One "Harga dasar − Diskon = Efektif" row, as typed. */
export interface PriceDraft {
  /** Digits as typed; "" follows the catalogue. */
  price: string;
  discountMode: DiscountMode;
  /** Digits as typed; "" is no discount. */
  discountValue: string;
}

export const BLANK_PRICE: PriceDraft = {
  price: "",
  discountMode: "amount",
  discountValue: "",
};

/** One animal on the form — one booking. */
export interface PetDraft {
  petId: string;
  serviceId: string;
  addonServiceIds: string[];
  /** "" is "Belum ditugaskan". */
  groomerUserId: string;
  internalNotes: string;
  main: PriceDraft;
  /** By add-on service id. An add-on without a row follows the catalogue. */
  addons: Record<string, PriceDraft>;
}

export function blankPetDraft(petId: string): PetDraft {
  return {
    petId,
    serviceId: "",
    addonServiceIds: [],
    groomerUserId: "",
    internalNotes: "",
    main: BLANK_PRICE,
    addons: {},
  };
}

const HUNDRED = 100n * 10_000n;

/** "150.000" → "150000"; a leading zero is dropped. Whole rupiah and whole percent only. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** What a discount takes off `basis` — the till's rule, in minor units. */
export function resolveDiscount(
  basis: bigint,
  mode: DiscountMode,
  value: string,
): bigint {
  const typed = value === "" ? null : toMinor(value);
  if (typed === null || typed <= 0n || basis <= 0n) return 0n;

  const off =
    mode === "percent"
      ? divideRound(basis * (typed > HUNDRED ? HUNDRED : typed), HUNDRED)
      : typed;

  return off > basis ? basis : off;
}

/** One price line, priced. `price` is null when the catalogue cannot say. */
export interface PricedLine {
  quote: bigint | null;
  price: bigint | null;
  discount: bigint;
  net: bigint;
  /** A price different from the quote, or any discount — needs the grant. */
  typed: boolean;
}

export function priceLine(quote: string | null, draft: PriceDraft): PricedLine {
  const quoteMinor = quote === null ? null : toMinor(quote);
  const typedMinor = draft.price === "" ? null : toMinor(draft.price);
  const price = typedMinor ?? quoteMinor;

  if (price === null) {
    return { quote: quoteMinor, price: null, discount: 0n, net: 0n, typed: false };
  }

  const discount = resolveDiscount(price, draft.discountMode, draft.discountValue);

  return {
    quote: quoteMinor,
    price,
    discount,
    net: price - discount,
    typed: (typedMinor !== null && typedMinor !== quoteMinor) || discount > 0n,
  };
}

/**
 * `total` split by `weights`, largest remainder — `tax.allocate` on the server.
 * With nothing to weigh by, everything lands on the first part, as it does there.
 */
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);

  if (weightTotal === 0n) {
    return weights.map((_, index) => (index === 0 ? total : 0n));
  }

  const parts = weights.map((weight) => (total * weight) / weightTotal);
  let left = total - parts.reduce((sum, part) => sum + part, 0n);

  const order = weights
    .map((weight, index) => ({ index, remainder: (total * weight) % weightTotal }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );

  for (const { index } of order) {
    if (left <= 0n) break;
    parts[index] += 1n;
    left -= 1n;
  }

  return parts;
}

/**
 * `total` split EVENLY, each part capped at `caps[i]` — `tax.allocateEvenly` on
 * the server. What a capped part cannot take is split across the rest; leftover
 * units go to the earliest parts with room.
 */
export function allocateEvenly(total: bigint, caps: bigint[]): bigint[] {
  const parts = caps.map(() => 0n);
  let left = total;

  while (left > 0n) {
    const open = caps
      .map((_, index) => index)
      .filter((index) => parts[index] < caps[index]);

    if (open.length === 0) break;

    const each = left / BigInt(open.length);

    if (each === 0n) {
      for (const index of open) {
        if (left === 0n) break;
        parts[index] += 1n;
        left -= 1n;
      }
      break;
    }

    for (const index of open) {
      const room = caps[index] - parts[index];
      const give = room < each ? room : each;
      parts[index] += give;
      left -= give;
    }
  }

  return parts;
}

/**
 * "Diskon seluruh booking": resolved against what the bookings come to after
 * their own discounts, and split EVENLY across them (16 September 2026) — no
 * booking takes more than it comes to.
 */
export function splitBookingDiscount(
  nets: bigint[],
  mode: DiscountMode,
  value: string,
): { total: bigint; shares: bigint[] } {
  const total = resolveDiscount(
    nets.reduce((sum, net) => sum + net, 0n),
    mode,
    value,
  );

  return {
    total,
    shares: total > 0n ? allocateEvenly(total, nets) : nets.map(() => 0n),
  };
}

/** What was typed, as the API takes it — or null when nothing comes off. */
export function typedDiscount(
  mode: DiscountMode,
  value: string,
): TypedDiscountInput | null {
  const typed = value === "" ? null : toMinor(value);
  return typed !== null && typed > 0n ? { mode, value } : null;
}

/**
 * One animal → one `bookings[]` entry.
 *
 * WHAT WAS TYPED, NOT WHAT IT RESOLVED TO — the server resolves it again, and a
 * client that sent the rupiah could claim 10% came to Rp 90.000. An untouched row
 * sends nothing, so somebody without `bookings:setPrice` never trips the 403.
 */
export function toEntry(draft: PetDraft): CreateBookingEntry {
  const addonPricing = draft.addonServiceIds
    .map((serviceId) => {
      const row = draft.addons[serviceId] ?? BLANK_PRICE;
      return {
        serviceId,
        price: row.price === "" ? null : row.price,
        discount: typedDiscount(row.discountMode, row.discountValue),
      };
    })
    .filter((row) => row.price !== null || row.discount !== null);

  const note = draft.internalNotes.trim();

  return {
    petId: draft.petId,
    serviceId: draft.serviceId,
    addonServiceIds: draft.addonServiceIds,
    groomerUserId: draft.groomerUserId === "" ? null : draft.groomerUserId,
    internalNotes: note === "" ? null : note,
    price: draft.main.price === "" ? null : draft.main.price,
    discount: typedDiscount(draft.main.discountMode, draft.main.discountValue),
    ...(addonPricing.length > 0 ? { addonPricing } : {}),
  };
}
