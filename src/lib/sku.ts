/**
 * How lists and pickers show an SKU: the WHOLE code, wrapped inside a column
 * about as wide as the old 12-character cut, so a long code grows downward
 * instead of widening the table.
 *
 * - `whitespace-normal` undoes the table cell's `whitespace-nowrap`.
 * - `overflow-wrap:anywhere` breaks a code with no spaces; the browser still
 *   prefers its hyphens, so "MKN-ROYAL-CANIN-2KG" splits at a dash.
 *
 * The code used to be truncated with an ellipsis and the full value left in a
 * hover title — unreadable on a touch screen, and users reported SKUs they
 * could not see.
 */
export const SKU_WRAP_CLASS =
  "inline-block max-w-[14ch] whitespace-normal [overflow-wrap:anywhere]";

/**
 * The longest SKU `SkuText` shows whole; a longer one is cut to this many
 * characters and opens the full code on hover or tap (16 October 2026).
 */
export const SKU_MAX_CHARS = 15;

/**
 * The same whole-code wrap for a column that has the room (19 October 2026):
 * Daftar Stok's SKU column and the SKU under a product name on Batch &
 * Expired. At least 16 characters wide, so an ordinary code reads on ONE line
 * instead of breaking every few letters, and wrapping only past 28. A table
 * that no longer fits scrolls sideways rather than squeezing this back.
 */
export const SKU_WRAP_WIDE_CLASS =
  "inline-block min-w-[16ch] max-w-[28ch] whitespace-normal [overflow-wrap:anywhere]";
