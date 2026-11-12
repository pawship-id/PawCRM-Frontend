import type { BenefitQuoteResponse } from "@/types/membership";
import type {
  PromoQuoteInput,
  PromoQuoteLine,
  PromoQuotePart,
  PromoQuoteResponse,
} from "@/types/promo";
import { isPositive } from "@/utils/decimal";

import { lineTotalOf } from "./invoicePreview";

/**
 * ─── PROMO ON A NEW FAKTUR (Promo V1, 8 November 2026) ────────────────────
 *
 * The server applies promos to a faktur's lines by itself on save — only the
 * promos with the "Faktur" channel ticked, on the invoice date. The form asks
 * `POST /promos/quote` (`channel: "invoice"`) so its preview shows the same
 * bill, and lets a row drop the promo ("Tanpa promo" → `promoIds: []`).
 * Nothing priced here is sent: the payload names promos, never amounts.
 *
 * WHAT THE SERVER DOES, mirrored per row:
 *   - no card benefit → the best promo;
 *   - an unlimited benefit → only "bisa digabung" promos ride on it, which is
 *     the quote's `recommended` while `useMember` is true;
 *   - a jatah → no promo.
 * When a promo would beat the unlimited benefit (`useMember: false`) the
 * server still keeps the benefit and stacks only what may stack; the preview
 * shows no promo then (an estimate — the saved faktur shows the server's).
 */

/** The slice of a form row this reads. */
export interface PromoRow {
  key: string;
  kind: "product" | "service";
  refId: string;
  petId?: string | null;
  qty: string;
  /** The price billed — a typed override wins over the catalogue's. */
  unitPrice: string;
  benefit: { membershipId: string; benefitId: string; amount: string } | null;
  /** "Tanpa promo" chosen on this row. */
  promoOff?: boolean;
}

/** Whether the card benefit on a row is a jatah, read off the member quote. */
export function benefitKindOf(
  row: PromoRow,
  memberQuote: BenefitQuoteResponse | null,
): "quota" | "unlimited" | null {
  if (!row.benefit) return null;
  const line = memberQuote?.lines?.find((entry) => entry.ref === row.key);
  const candidate = (line?.candidates ?? []).find(
    (entry) =>
      entry.membershipId === row.benefit?.membershipId &&
      entry.benefitId === row.benefit?.benefitId,
  );
  /* Unknown reads as unlimited: the engine then only lets a stackable ride. */
  return candidate?.kind ?? "unlimited";
}

export function invoicePromoInput({
  rows,
  customerId,
  branchId,
  invoiceDate,
  memberQuote,
}: {
  rows: PromoRow[];
  customerId: string | null;
  branchId: string | null;
  /** The form's "YYYY-MM-DD"; empty asks nothing. */
  invoiceDate: string;
  memberQuote: BenefitQuoteResponse | null;
}): PromoQuoteInput | null {
  if (!invoiceDate) return null;
  const at = new Date(invoiceDate);
  if (Number.isNaN(at.getTime())) return null;

  const lines = rows.flatMap((row) => {
    if (!row.refId) return [];
    const amount = lineTotalOf(row.qty, row.unitPrice);
    if (!isPositive(amount)) return [];
    const kind = benefitKindOf(row, memberQuote);
    return [
      {
        ref: row.key,
        kind: row.kind,
        refId: row.refId,
        petId: row.petId || null,
        qty: row.qty,
        amount,
        member: row.benefit && kind ? { kind, discount: row.benefit.amount } : null,
      },
    ];
  });

  if (lines.length === 0) return null;
  return {
    channel: "invoice",
    branchId: branchId || null,
    customerId: customerId || null,
    at: at.toISOString(),
    lines,
  };
}

export interface RowPromo {
  /** What the promo takes off the row — "0" when none. */
  discount: string;
  /** The promos counted. */
  parts: PromoQuotePart[];
  /** A promo exists for the row (so "Pakai promo" can be offered after removing it). */
  available: boolean;
}

const NONE: RowPromo = { discount: "0", parts: [], available: false };

/** The promo one row gets, by the server's rules — see the file note. */
export function rowPromoOf(
  row: PromoRow,
  quoteLine: PromoQuoteLine | null,
  memberQuote: BenefitQuoteResponse | null,
): RowPromo {
  if (!quoteLine) return NONE;
  const kind = benefitKindOf(row, memberQuote);
  const available = kind !== "quota" && quoteLine.candidates.length > 0;

  if (row.promoOff || kind === "quota") return { ...NONE, available };
  const { recommended } = quoteLine;
  if (kind === "unlimited" && !recommended.useMember) return { ...NONE, available };
  if (!isPositive(recommended.discount)) return { ...NONE, available };

  return { discount: recommended.discount, parts: recommended.parts, available };
}

/** The quote line answering a row, or null. */
export function promoLineOfRow(
  quote: PromoQuoteResponse | null,
  key: string,
): PromoQuoteLine | null {
  return quote?.lines?.find((line) => line.ref === key) ?? null;
}
