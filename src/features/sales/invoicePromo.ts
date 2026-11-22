import {
  candidateKey,
  candidatePick,
  pickKey,
} from "@/features/pos/membershipCart";
import type { PotonganChange, PotonganItem } from "@/features/pos/promoCart";
import type {
  BenefitCandidate,
  BenefitQuoteLine,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
} from "@/types/membership";
import type {
  PromoQuoteInput,
  PromoQuoteLine,
  PromoQuotePart,
  PromoQuoteResponse,
} from "@/types/promo";
import { isPositive, sumDecimals } from "@/utils/decimal";

import { lineTotalOf } from "./invoicePreview";

/**
 * ─── POTONGAN ON A NEW FAKTUR — THE TILL'S RULES (20 November 2026) ───────
 *
 * The faktur prices membership benefits and promos exactly as the till does
 * (`features/pos/membershipCart.ts`, `promoCart.ts`), on request: "treatment
 * sama dengan kasir".
 *
 *   1. EVERY ROW IS QUOTED — goods, services, add-ons (as `addon`, under
 *      their service), with their quantity — not only a service with an
 *      animal. A customer's card covers a row with no animal; a benefit on
 *      goods or add-ons is offered like at the till.
 *   2. THE BEST BENEFIT IS PUT ON BY ITSELF (`invoiceAutoApply`) on every row
 *      nobody decided for, the quote's `recommended` — the till's auto-apply.
 *   3. A PROMO THAT BEATS AN UNLIMITED BENEFIT TAKES ITS PLACE
 *      (`invoicePromoSwitches`); a jatah is never swapped.
 *   4. ONE "POTONGAN" SELECT PER ROW — Jatah / Member / Promo / Tanpa
 *      potongan — the till's `PosBenefitSelect` options and writes.
 *
 * THE SERVER PRICES EVERYTHING on save — only promos with the "Faktur"
 * channel ticked, on the invoice date. The row sends WHICH card and benefit
 * (`benefit`) and WHICH promos (`promoIds`: absent = automatic, `[]` = none);
 * every figure here is a preview read off the two quotes.
 */

/** The row's card pick, as the faktur holds it. */
export interface InvoiceBenefitPick {
  membershipId: string;
  /** A package on this same bill — its virtual card's id changes every quote. */
  packageRef?: string | null;
  benefitId: string;
  optionId?: string | null;
  /** What the server quoted — for the preview only, never sent. */
  amount: string;
  benefitLabel: string | null;
}

/** The slice of a form row this reads. */
export interface PromoRow {
  key: string;
  /** A package line (`membership`) takes no promo — the server skips it too. */
  kind: "product" | "service" | "membership";
  refId: string;
  petId?: string | null;
  qty: string;
  /** The price billed — a typed override wins over the catalogue's. */
  unitPrice: string;
  benefit: Pick<InvoiceBenefitPick, "membershipId" | "packageRef" | "benefitId" | "amount"> & {
    optionId?: string | null;
  } | null;
  /**
   * WHICH PROMOS — `null`/absent = automatic (the server picks the best),
   * `[]` = none ("Tanpa potongan", or a jatah), `[ids]` = those, in order.
   */
  promoPick?: string[] | null;
}

/* ─────────────────────────────────────────────────────── the member quote */

/** A row as the member quote needs it — see `invoiceBenefitQuoteLines`. */
export interface BenefitQuoteRow {
  key: string;
  kind: "product" | "service" | "membership";
  refId: string;
  petId: string;
  qty: string;
  unitPrice: string;
  /** An add-on: the service row it hangs under, by `refId`. */
  addonOf: string | null;
  /** An antar-jemput row — its animals ride in `passengers`, never `petId`. */
  ride: boolean;
  benefit: InvoiceBenefitPick | null;
  /** "Tanpa potongan" or a promo chosen here — nothing auto-applied. */
  noBenefit?: boolean;
}

/**
 * The member quote's lines — the till's `buildQuoteInput`, for a faktur.
 *
 * `ref` IS THE ROW'S KEY. A row's pick is PINNED (sent back), so the quote
 * keeps it as `recommended` while it still holds and every later row competes
 * with it, exactly as at the till. A pick from a package on this bill is not
 * pinned — its virtual card's id changes on every quote.
 *
 * A SERVICE WITH NO ANIMAL YET is left out: it cannot be priced, and the save
 * is blocked until one is chosen. A ride carries no `petId` of its own.
 */
export function invoiceBenefitQuoteLines(rows: BenefitQuoteRow[]): BenefitQuoteLine[] {
  return rows.flatMap((row) => {
    if (!row.refId || row.kind === "membership") return [];
    if (row.kind === "service" && !row.petId && !row.ride) return [];

    const amount = lineTotalOf(row.qty, row.unitPrice);
    const line: BenefitQuoteLine = {
      ref: row.key,
      kind: row.kind === "service" && row.addonOf ? "addon" : row.kind,
      refId: row.refId,
      petId: row.kind === "service" && !row.ride ? row.petId || null : null,
      amount,
      qty: Number(row.qty) || 1,
      parentServiceId: row.kind === "service" ? row.addonOf : null,
    };

    if (row.benefit && !row.benefit.packageRef) {
      line.membershipId = row.benefit.membershipId;
      line.benefitId = row.benefit.benefitId;
      line.optionId = row.benefit.optionId ?? null;
    } else if (!row.benefit && row.noBenefit) {
      line.noBenefit = true;
    }

    return [line];
  });
}

/** The member quote line answering a row, or null. */
export function memberLineOfRow(
  quote: BenefitQuoteResponse | null,
  key: string,
): BenefitQuoteLineResult | null {
  return quote?.lines?.find((line) => line.ref === key) ?? null;
}

/** The row's pick, keyed like a candidate — "which card, which benefit". */
function rowPickKey(benefit: NonNullable<PromoRow["benefit"]>): string {
  return pickKey({
    membershipId: benefit.packageRef ? null : benefit.membershipId,
    packageRef: benefit.packageRef ?? null,
    benefitId: benefit.benefitId,
  });
}

/** The candidate a row's pick stands for in the quote, or null. */
export function candidateOfRow(
  row: Pick<PromoRow, "benefit">,
  memberLine: BenefitQuoteLineResult | null,
): BenefitCandidate | null {
  if (!row.benefit) return null;
  const key = rowPickKey(row.benefit);
  return (memberLine?.candidates ?? []).find((candidate) => candidateKey(candidate) === key) ?? null;
}

/** A candidate as the row's pick. */
export function pickOfCandidate(candidate: BenefitCandidate): InvoiceBenefitPick {
  const pick = candidatePick(candidate);
  return {
    membershipId: candidate.membershipId,
    packageRef: pick.packageRef ?? null,
    benefitId: candidate.benefitId,
    optionId: candidate.optionId ?? null,
    amount: candidate.discount,
    benefitLabel: candidate.label ?? candidate.benefitLabel ?? null,
  };
}

/** What the auto-apply writes on one row. */
export interface BenefitSync {
  key: string;
  benefit: InvoiceBenefitPick | null;
}

/**
 * WHAT TO WRITE WITHOUT ASKING — the till's `autoApplyChanges`, plus keeping
 * a pick's figure in step with the quote:
 *
 *   - a row with no pick, nobody chose "Tanpa potongan" or a promo for, and
 *     no discount typed → the quote's `recommended`;
 *   - a row whose pick is still a candidate → its figure refreshed (the
 *     quantity or the price moved);
 *   - a row whose pick is no longer a candidate (a jatah used up by a row
 *     above, another animal) → dropped, else the server refuses the save.
 *
 * Read only against a SETTLED quote — a stale one could drop a pick that the
 * next answer would have kept.
 */
export function invoiceAutoApply(
  rows: Array<BenefitQuoteRow & { discountValue?: string }>,
  quote: BenefitQuoteResponse | null,
): BenefitSync[] {
  if (!quote) return [];

  return rows.flatMap((row): BenefitSync[] => {
    if (row.kind === "membership") return [];
    const line = memberLineOfRow(quote, row.key);

    if (row.benefit) {
      /* The row was not asked about (no animal yet) — leave it to the next quote. */
      if (!line) return [];
      const candidate = candidateOfRow(row, line);
      if (!candidate) return [{ key: row.key, benefit: null }];
      if (
        candidate.discount === row.benefit.amount &&
        (candidate.optionId ?? null) === (row.benefit.optionId ?? null)
      ) {
        return [];
      }
      return [{ key: row.key, benefit: pickOfCandidate(candidate) }];
    }

    if (row.noBenefit || !line?.recommended) return [];
    /* A discount somebody typed is their decision — a card would refuse it. */
    if (row.discountValue && Number(row.discountValue) > 0) return [];
    return [{ key: row.key, benefit: pickOfCandidate(line.recommended) }];
  });
}

/** Whether the card benefit on a row is a jatah, read off the member quote. */
export function benefitKindOf(
  row: Pick<PromoRow, "key" | "benefit">,
  memberQuote: BenefitQuoteResponse | null,
): "quota" | "unlimited" | null {
  if (!row.benefit) return null;
  const candidate = candidateOfRow(row, memberLineOfRow(memberQuote, row.key));
  /* Unknown reads as unlimited: the engine then only lets a stackable ride. */
  return candidate?.kind ?? "unlimited";
}

/* ───────────────────────────────────────────────────────── the promo quote */

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
    if (!row.refId || row.kind === "membership") return [];
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

/**
 * ROWS WHERE A PROMO BEATS THE CARD'S UNLIMITED BENEFIT — the till's
 * `promoSwitches`: the card comes off and the winning promo is named, which
 * also keeps the auto-apply off the row from then on. Only rows nobody
 * decided for (`promoPick` still automatic, the select untouched). A jatah is
 * never swapped (the engine keeps it: `useMember` true).
 */
export function invoicePromoSwitches(
  rows: Array<PromoRow & { chosen?: boolean }>,
  memberQuote: BenefitQuoteResponse | null,
  promoQuote: PromoQuoteResponse | null,
): Array<{ key: string; promoIds: string[] }> {
  if (!promoQuote) return [];

  return rows.flatMap((row) => {
    if (!row.benefit || row.chosen || Array.isArray(row.promoPick)) return [];
    if (row.benefit.packageRef) return [];
    if (benefitKindOf(row, memberQuote) !== "unlimited") return [];

    const line = promoLineOfRow(promoQuote, row.key);
    if (!line || line.recommended.useMember || line.recommended.promoIds.length === 0) {
      return [];
    }
    return [{ key: row.key, promoIds: line.recommended.promoIds }];
  });
}

export interface RowPromo {
  /** What the promo takes off the row — "0" when none. */
  discount: string;
  /** The promos counted. */
  parts: PromoQuotePart[];
  /** A promo exists for the row. */
  available: boolean;
}

const NONE: RowPromo = { discount: "0", parts: [], available: false };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * The promo one row gets, by the server's rules — see the file note.
 *
 * A PICKED SET is priced from the quote: the recommendation when it is the
 * same set, else the candidates' own cuts added up (an estimate for a stack
 * nobody recommended — the saved faktur shows the server's).
 */
export function rowPromoOf(
  row: PromoRow,
  quoteLine: PromoQuoteLine | null,
  memberQuote: BenefitQuoteResponse | null,
): RowPromo {
  if (!quoteLine) return NONE;
  const kind = benefitKindOf(row, memberQuote);
  const available = kind !== "quota" && quoteLine.candidates.length > 0;
  if (kind === "quota") return { ...NONE, available };

  const { recommended } = quoteLine;

  if (Array.isArray(row.promoPick)) {
    if (row.promoPick.length === 0) return { ...NONE, available };
    if (sameSet(row.promoPick, recommended.promoIds) && isPositive(recommended.discount)) {
      return { discount: recommended.discount, parts: recommended.parts, available };
    }
    const parts = row.promoPick.flatMap((id) => {
      const part = quoteLine.candidates.find((candidate) => candidate.promoId === id);
      return part ? [part] : [];
    });
    /* With a card on the row only a "bisa digabung" promo may ride. */
    const allowed = row.benefit ? parts.filter((part) => part.stackable) : parts;
    if (allowed.length === 0) return { ...NONE, available };
    return { discount: sumDecimals(allowed.map((part) => part.discount)), parts: allowed, available };
  }

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

/* ──────────────────────────────────────────────────────── the select */

/** A row as the till's "Potongan" select reads a line. */
export function potonganItemOf(
  row: Pick<PromoRow, "benefit"> & { benefitLabel?: string | null },
  promo: RowPromo,
): PotonganItem {
  return {
    benefit: row.benefit
      ? {
          membershipId: row.benefit.packageRef ? null : row.benefit.membershipId,
          packageRef: row.benefit.packageRef ?? null,
          benefitId: row.benefit.benefitId,
          optionId: row.benefit.optionId ?? null,
        }
      : null,
    discount: { benefitLabel: row.benefitLabel ?? null },
    promos: promo.parts,
  };
}

/** What a choice in the select writes on the row. */
export interface RowPotonganPatch {
  benefit: InvoiceBenefitPick | null;
  promoPick: string[] | null;
  noBenefit: boolean;
  /** Somebody chose — no automatic swap to a promo from now on. */
  potonganChosen: true;
}

/** The till's `potonganChange`, as a patch for a faktur row. */
export function rowPotonganPatch(
  change: PotonganChange,
  memberLine: BenefitQuoteLineResult | null,
): RowPotonganPatch {
  let benefit: InvoiceBenefitPick | null = null;
  if (change.benefit) {
    const key = pickKey(change.benefit);
    const candidate = (memberLine?.candidates ?? []).find((entry) => candidateKey(entry) === key);
    benefit = candidate ? pickOfCandidate(candidate) : null;
  }
  return {
    benefit,
    promoPick: change.promoIds,
    noBenefit: change.noBenefit,
    potonganChosen: true,
  };
}
