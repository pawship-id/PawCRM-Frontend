/** Screens show at most this many characters of an SKU, the ellipsis included. */
export const SKU_DISPLAY_MAX = 12;

/**
 * An SKU as lists and pickers show it: the first characters and an ellipsis once
 * it is longer than `SKU_DISPLAY_MAX`.
 *
 * Display only. The product detail page, the product form, exports and anything
 * sent to the API keep the full code.
 */
export function shortSku(
  sku: string | null | undefined,
  max: number = SKU_DISPLAY_MAX,
): string {
  const value = sku ?? "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
