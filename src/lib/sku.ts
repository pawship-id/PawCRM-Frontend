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

/** A code this short fits the column on one line, so it needs no wrapper. */
export const SKU_WRAP_CHARS = 14;
