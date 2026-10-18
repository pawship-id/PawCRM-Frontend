/**
 * What a batch label's QR carries (18 Oct 2026), and reading it back.
 *
 * ONE FIELD A LINE, LABELLED, so a phone's own camera app shows something a
 * person can read:
 *
 *   BULOO
 *   SKU:RC-KITTEN-2KG
 *   BC:8991234567890
 *   BATCH:B2610-0042
 *   SPL:LOT77812
 *   EXP:2027-01-31
 *
 * THE LOT CODES ONLY WHEN THE LOT HAS AN EXPIRY (decided 18 Oct 2026): that is
 * where the lot matters — which carton goes first. A lot with no expiry is
 * labelled by SKU and barcode alone, and is found by them at the till.
 *
 * THE SERVER READS THIS SAME FORMAT (PawCRM-Backend `utils/labelPayload.js`),
 * including the run-together shape a handheld scanner types. Change both or
 * neither.
 */
export const LABEL_HEADER = "BULOO";

export interface LabelCodes {
  sku?: string | null;
  barcode?: string | null;
  batch?: string | null;
  supplierBatch?: string | null;
  /** `YYYY-MM-DD`. */
  expiry?: string | null;
}

/** The text a batch label's QR encodes. */
export function labelPayload({
  sku,
  barcode,
  batchCode,
  supplierBatchCode,
  expiryDate,
}: {
  sku: string | null | undefined;
  barcode: string | null | undefined;
  batchCode: string;
  supplierBatchCode: string | null | undefined;
  expiryDate: string | null | undefined;
}): string {
  const lines = [LABEL_HEADER];

  if (sku) lines.push(`SKU:${sku}`);
  if (barcode) lines.push(`BC:${barcode}`);

  /*
    A label with nothing else on it still carries its lot code — a QR that names
    nothing would be a square nobody can use.
  */
  if (expiryDate || lines.length === 1) {
    lines.push(`BATCH:${batchCode}`);
    if (supplierBatchCode) lines.push(`SPL:${supplierBatchCode}`);
  }
  if (expiryDate) lines.push(`EXP:${expiryDate.slice(0, 10)}`);

  return lines.join("\n");
}

const FIELDS: Record<string, keyof LabelCodes> = {
  SKU: "sku",
  BC: "barcode",
  BATCH: "batch",
  SPL: "supplierBatch",
  EXP: "expiry",
};
// Longest first, so `BATCH:` is never read as `BC:` plus something.
const LABEL = /(BATCH|SKU|SPL|EXP|BC):/g;

/** The codes on one of our labels, or null when `text` is anything else. */
export function parseLabelPayload(text: string): LabelCodes | null {
  const raw = text.trim();
  if (!raw.toUpperCase().startsWith(LABEL_HEADER)) return null;

  const body = raw.slice(LABEL_HEADER.length);
  const marks = [...body.matchAll(LABEL)];
  if (marks.length === 0) return null;

  const parsed: LabelCodes = {};
  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end =
      index + 1 < marks.length ? (marks[index + 1].index ?? 0) : body.length;
    const value = body.slice(start, end).trim();
    if (value) parsed[FIELDS[mark[1]]] = value;
  });

  return Object.keys(parsed).length > 0 ? parsed : null;
}

/**
 * The one code worth putting in the search box when a scan did not name exactly
 * one product. The SKU first: it is what the grid shows and highlights, and it
 * still finds the product when the lot was moved to another warehouse. A plain
 * code is itself.
 */
export function searchableCode(scanned: string): string {
  const label = parseLabelPayload(scanned);
  if (!label) return scanned.trim();
  return label.sku ?? label.barcode ?? label.batch ?? scanned.trim();
}
