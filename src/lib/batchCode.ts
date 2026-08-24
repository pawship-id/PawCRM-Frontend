import { formatQty } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

/**
 * How the client presents the two batch codes: the SHAPE of the internal one,
 * mirrored from the server so a form can show it before anything is saved, and
 * the one-line label a lot is offered under in a picker.
 *
 * TWO CODES EXIST, and only one of them has a shape worth mirroring:
 *
 *   internal — OURS. Generated, unique across the tenant like an SKU, printed as
 *              the barcode a till scans. Nobody types it, and no form sends one:
 *              the API refuses a client-supplied code outright.
 *   supplier — THEIRS. The number printed on the carton, typed in when goods
 *              arrive, deliberately not unique — one factory batch split across
 *              three deliveries is three lots a recall has to find together.
 *
 * WHAT THIS FILE IS FOR, and its one limitation. The server owns the code, so
 * the honest thing for a form to show is the code the SERVER says it will use —
 * which is what the preview endpoints return, and what every form here reads
 * when it has a preview. This is the fallback for the moment before a preview
 * has come back: a row just added, a date just typed.
 *
 * IT CAN BE ONE SUFFIX WRONG, and that is unavoidable rather than sloppy. The
 * code is unique, so a second lot of the same goods becomes `-2`, and nothing in
 * the browser knows what is already taken. Show it as a HINT, never as the
 * finished code — `BatchCodeField` is the component that gets this right.
 *
 * Keep it in step with src/utils/batchCode.js on the server; the shape is
 * asserted on both sides.
 */

/** The API's own limit. */
const BATCH_CODE_MAX_LENGTH = 60;

/** How much of the SKU survives into the stem. */
const SKU_STEM_LENGTH = 16;

/**
 * The SKU as a code stem: upper case, letters and digits only.
 *
 * Punctuation is DROPPED rather than replaced with `-`, because `-` is the
 * separator: an SKU of `WSK-B26` would otherwise produce `WSK-B26-270301`, in
 * which nothing can tell the SKU's dash from the one before the date.
 */
function skuStem(sku: string | null | undefined): string {
  const cleaned = String(sku ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  // "LOT" rather than an empty stem: a parent product has no SKU, and a code
  // that opened with its own separator would read as a truncation.
  return (cleaned || "LOT").slice(0, SKU_STEM_LENGTH);
}

/** `2027-03-01` — an ISO string, or nothing — as `270301`. */
function dateStem(value: string): string {
  const parsed = value ? new Date(value) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

  // `toISOString` rather than a locale format, so the stem does not change
  // shape with the browser's timezone.
  return date.toISOString().slice(2, 10).replace(/-/g, "");
}

/**
 * The code a lot WANTS, before the server checks whether it is free.
 *
 * Keyed on the expiry, because that is what distinguishes one lot of a product
 * from the next and what FEFO already orders by. Goods that never expire —
 * consigned stock, which needs a lot of its own because it carries its own
 * hand-entered cost — fall back to the document's own date.
 *
 * A HINT, NOT THE CODE. See the header: the saved one may carry a `-2`.
 */
export function batchCodeHint(
  sku: string | null | undefined,
  expiryDate: string,
  documentDate: string,
): string {
  return `${skuStem(sku)}-${dateStem(expiryDate || documentDate)}`.slice(
    0,
    BATCH_CODE_MAX_LENGTH,
  );
}

/**
 * How a lot reads in a picker — receiving, penyesuaian and transfer all offer
 * the same list and now say it the same way.
 *
 * BOTH CODES, and that is the point of the helper. Choosing a lot is the act of
 * matching a row on screen to a carton in somebody's hands, and the number
 * printed on the carton is the SUPPLIER's: ours identifies the row, theirs is
 * what can be read off the box. A picker showing only ours asks the user to
 * remember which of our codes the thing in their hands was given.
 *
 * The supplier segment is dropped when the lot carries none, which is the
 * ordinary case — most cartons print no number, and an empty `supplier —` in
 * every row would be noise in the one place the list has to stay scannable.
 *
 * `·` throughout, never `-`: a hyphen separator sits inside the codes
 * themselves, so `VAKSIN-270301 - sisa 8` reads as one broken code.
 */
export function lotOptionLabel(lot: ProductBatch): string {
  return [
    lot.batchCode,
    lot.supplierBatchCode && `supplier ${lot.supplierBatchCode}`,
    `sisa ${formatQty(lot.qtyRemaining)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
