import { divideRound, toMinor, toDecimalString } from "@/utils/decimal";
import type { TypedDiscountInput } from "@/types/api";

/**
 * WHAT THE INVOICE WILL COME TO — computed in the browser, so the form can show a
 * total before anything is saved.
 *
 * THE SERVER IS THE AUTHORITY, always. `utils/invoicePricing.js` is what actually
 * prices an issued invoice; this mirrors its ORDER so the number on screen is the
 * number that gets billed. It exists because a form that asks somebody to approve
 * a bill without showing them the bill is not a form.
 *
 * THE SAME ARITHMETIC, NOT AN APPROXIMATION. Integers throughout, via the same
 * `divideRound` half-up rule the server uses — `Number` would drift on a 7,5%
 * discount and the screen would disagree with the invoice by a rupiah, which is
 * exactly the kind of difference nobody can explain to a customer.
 *
 * EACH LINE'S SLICE OF THE TAX IS COMPUTED, for the form's Pajak column, the
 * way the server freezes it per line: tax on the WHOLE document, then allocated
 * back down by each line's net after both discounts, largest remainder first.
 * The document's DPP itself is still not shown before saving — it appears on
 * the issued invoice.
 *
 * DRIFT IS THE RISK and it is worth naming: two implementations of one rule can
 * diverge. What keeps them together is that the ORDER is the specification (line
 * discount → invoice discount → tax), it is stated in both files, and the server
 * refuses anything it disagrees with rather than silently accepting the client's
 * number — nothing here is ever sent as a total.
 */
export interface PreviewLine {
  qty: string;
  unitPrice: string;
  discount?: TypedDiscountInput | null;
}

export interface InvoicePreview {
  /** Per line, in the order given — `qty × unitPrice` before its own discount. */
  lineTotals: string[];
  /** What each line's own discount takes off, after the cap. */
  lineDiscounts: string[];
  /**
   * Each line's slice of the invoice's PPN, in the order given — ON TOP of the
   * line on exclusive pricing, INSIDE it on inclusive. The parts sum to exactly
   * the document's tax, as the server's do.
   */
  lineTaxes: string[];
  subtotal: string;
  itemDiscount: string;
  invoiceDiscount: string;
  /**
   * The tax ADDED ON TOP, and zero whenever prices already include it.
   *
   * NOT "the tax on this invoice" — on inclusive pricing there is tax, it is
   * simply already inside `subtotal`, and the server unwinds it at posting. A
   * row reading "PPN Rp 0" on an inclusive invoice would be a lie about a tax
   * that was charged.
   *
   * It exists because the recap must ADD UP. Without it the list ran Subtotal
   * Rp 100.000 → Total Rp 111.000 with nothing between them to explain the jump.
   */
  taxAdded: string;
  /** What the customer owes. Tax included when prices include tax. */
  grandTotal: string;
}

const ZERO = 0n;
const ONE = toMinor("1") as bigint;
const HUNDRED = toMinor("100") as bigint;

/** A client value to minor units, treating anything unparseable as zero. */
const parse = (value: string | null | undefined): bigint => toMinor(value ?? "") ?? ZERO;

/**
 * What a discount takes off a basis — the same three rules the server applies.
 *
 * A percent above 100 and a negative value both resolve to something harmless
 * here rather than throwing: this is a live preview of a half-typed form, and a
 * field mid-edit is not an error yet. The SERVER refuses them, which is where a
 * refusal belongs.
 */
function resolveDiscount(
  basis: bigint,
  discount: TypedDiscountInput | null | undefined,
): bigint {
  if (!discount) return ZERO;

  const value = parse(discount.value);
  if (value <= ZERO) return ZERO;

  const resolved =
    discount.mode === "percent"
      ? divideRound(basis * (value > HUNDRED ? HUNDRED : value), HUNDRED)
      : value;

  // Capped at the basis: a nominal discount larger than the line is a typo, and
  // the alternative is a line that pays the customer.
  return resolved > basis ? basis : resolved;
}

/** The base inside a tax-inclusive amount — `tax.baseFromGross` on the server. */
const baseFromGross = (gross: bigint, rate: bigint): bigint =>
  divideRound(gross * HUNDRED, HUNDRED + rate);

/**
 * Splits `total` across `weights` in proportion, the parts summing to EXACTLY
 * the total — `tax.allocate` on the server, rule for rule: floor shares, the
 * leftover units to the largest discarded fractions, ties to the earlier index,
 * and everything on the first part when no line carries any weight.
 */
function allocate(total: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];

  const weightTotal = weights.reduce((sum, weight) => sum + weight, ZERO);
  if (weightTotal === ZERO) {
    return weights.map((_, index) => (index === 0 ? total : ZERO));
  }

  const parts = weights.map((weight) => (total * weight) / weightTotal);
  let leftover = total - parts.reduce((sum, part) => sum + part, ZERO);

  const ranked = weights
    .map((weight, index) => ({ index, remainder: (total * weight) % weightTotal }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );

  for (let rank = 0; leftover > ZERO && rank < ranked.length; rank += 1) {
    parts[ranked[rank].index] += 1n;
    leftover -= 1n;
  }

  return parts;
}

export function previewInvoice(
  lines: PreviewLine[],
  invoiceDiscount: TypedDiscountInput | null = null,
  { priceIncludesTax = true, taxRate = 0 }: { priceIncludesTax?: boolean; taxRate?: number } = {},
): InvoicePreview {
  const lineTotals: bigint[] = [];
  const lineDiscounts: bigint[] = [];

  lines.forEach((line) => {
    // Both operands carry the scale, so their product carries it twice.
    const total = divideRound(parse(line.qty) * parse(line.unitPrice), ONE);
    lineTotals.push(total);
    lineDiscounts.push(resolveDiscount(total, line.discount));
  });

  const subtotal = lineTotals.reduce((sum, value) => sum + value, ZERO);
  const itemDiscount = lineDiscounts.reduce((sum, value) => sum + value, ZERO);

  // MEASURED AFTER THE LINE DISCOUNTS, which changes the answer: 10% of what is
  // left after a Rp 100.000 line discount is not 10% of the gross.
  const afterItems = subtotal - itemDiscount;
  const documentDiscount = resolveDiscount(afterItems, invoiceDiscount);

  const net = afterItems - documentDiscount;
  const rate = toMinor(String(taxRate)) ?? ZERO;

  /*
    WITH INCLUSIVE PRICES THE TOTAL NEEDS NO TAX RATE — the tax is already inside
    the shelf price and is merely unwound server-side. With exclusive prices it is
    added on top, and getting this branch wrong understates a bill by the whole
    tax.
  */
  const taxAdded = priceIncludesTax ? ZERO : divideRound(net * rate, HUNDRED);

  /*
    THE DOCUMENT'S TAX, as `tax.applyDiscountThenTax` derives it. Inclusive: the
    gross and the discounts are unwound SEPARATELY and the tax is what is left
    between the net and its base — not `baseFromGross(net)`, which rounds once
    instead of twice and can miss the server by a minor unit.
  */
  const documentTax = priceIncludesTax
    ? net -
      (baseFromGross(subtotal, rate) -
        baseFromGross(itemDiscount + documentDiscount, rate))
    : taxAdded;

  // PRORATED BY NET LINE VALUE — the invoice discount first, then the tax by
  // what each line is worth after both discounts.
  const documentDiscountShares = allocate(
    documentDiscount,
    lineTotals.map((total, index) => total - lineDiscounts[index]),
  );
  const lineTaxes = allocate(
    documentTax,
    lineTotals.map(
      (total, index) => total - lineDiscounts[index] - documentDiscountShares[index],
    ),
  );

  const grandTotal = net + taxAdded;

  return {
    lineTotals: lineTotals.map(toDecimalString),
    lineDiscounts: lineDiscounts.map(toDecimalString),
    lineTaxes: lineTaxes.map(toDecimalString),
    subtotal: toDecimalString(subtotal),
    itemDiscount: toDecimalString(itemDiscount),
    invoiceDiscount: toDecimalString(documentDiscount),
    taxAdded: toDecimalString(taxAdded),
    grandTotal: toDecimalString(grandTotal),
  };
}
