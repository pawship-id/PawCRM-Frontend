/**
 * The batch code a lot falls back to when the field is left blank.
 *
 * SUPPLIERS OFTEN DO NOT PRINT ONE, and neither does a shelf being counted or a
 * catalogue being opened. Demanding a code anyway made whoever was holding the
 * carton invent it, and an invented code is either "1", the invoice number, or
 * whatever the last person typed — none of which identifies a lot when it has to
 * be recalled or returned months later. So the field is optional and this fills
 * it, from what the goods themselves already say.
 *
 * KEYED ON THE EXPIRY DATE, because that is what actually distinguishes one lot
 * of a product from the next, and what FEFO already orders by: two people
 * entering the same delivery land on the same code, and a second van carrying
 * the same expiry lands on it too — correctly, since `batchCode` is deliberately
 * NOT unique (see productbatches) and one code arriving twice is two rows.
 *
 * Goods that never expire — consigned stock, which needs its own lot because it
 * carries its own hand-entered cost — fall back to the document's own date, the
 * only thing separating one consignment of them from the next.
 *
 * THE SERVER APPLIES THIS SAME RULE (`#autoBatchCode` in stockMovement.service),
 * so a form may simply send nothing and get the identical code back. What this
 * copy is for is SHOWING the code before it is saved: a placeholder that reads
 * `SHAMPOO:2027-03-01` explains the rule better than any sentence about it.
 * Keep the two in step — the shape is asserted on both sides.
 */

/** The API's own limit, minus the `:tanggal` this appends. */
const BATCH_CODE_MAX_LENGTH = 60;

export function autoBatchCode(
  sku: string | null | undefined,
  expiryDate: string,
  documentDate: string,
): string {
  const date = expiryDate || documentDate;
  // Truncated rather than refused: a 60-character SKU is the catalogue's
  // problem, and losing the tail of it beats losing the document.
  const stem = (sku ?? "LOT").slice(0, BATCH_CODE_MAX_LENGTH - date.length - 1);
  return `${stem}:${date}`;
}
