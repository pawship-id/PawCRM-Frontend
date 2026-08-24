/**
 * Cutting a free-text note to fit a table cell, around whatever was searched.
 *
 * IN A UTIL RATHER THAN IN ONE SCREEN because two of them now cut the same kind
 * of text for the same reason — the stock-entry lists and the transfer list all
 * search a note the server matches in full and a cell can only show part of.
 * Copy-pasting it is how one of them quietly stops agreeing with `HighlightText`
 * about which characters are on screen.
 */

/**
 * How much of a reason a cell shows before it is cut.
 *
 * Short enough that a long sentence cannot push the columns beside it off a
 * laptop, long enough that most reasons — "barang rusak kena air" — arrive
 * whole.
 */
const EXCERPT_LENGTH = 60;

/**
 * A reason, cut to fit — AROUND THE MATCH when there is one.
 *
 * WHY NOT `truncate`. CSS cuts from the end, always. The server searches the
 * reason as well as the number, so a term matching the eightieth character
 * returns a row whose reason cell shows the first sixty and no mark in them:
 * the reader is looking at a result with nothing on it to explain why it is a
 * result, which is worse than not showing the column at all.
 *
 * So the window follows the match. Ellipses are added on whichever side was
 * actually cut, so a leading "…" means "there is more before this" rather than
 * being decoration.
 *
 * A PURE FUNCTION over the text, deliberately: this has to agree with
 * `HighlightText`, which marks occurrences in whatever string it is handed. Cut
 * first, mark second, and the mark is always inside what is shown.
 */
export function excerptAround(
  text: string,
  term: string,
  max = EXCERPT_LENGTH,
): string {
  if (text.length <= max) return text;

  const needle = term.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;

  // No term, or a term that matched the NUMBER instead: the opening words are
  // the most useful cut, and the reader is not looking for anything in here.
  if (at === -1) return `${text.slice(0, max).trimEnd()}…`;

  // Centred on the match, then clamped — a match near either end must not leave
  // the window half empty.
  const half = Math.max(0, Math.floor((max - needle.length) / 2));
  const start = Math.min(
    Math.max(0, at - half),
    Math.max(0, text.length - max),
  );
  const end = Math.min(text.length, start + max);

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
}
