/**
 * The ordering rule the settings lists share — Data hewan and Tahapan both keep
 * a `sortOrder` that every picker follows, and both move a row with Naikkan /
 * Turunkan. Moved out of `petOptions.ts` when Tahapan became the second caller
 * (14 September 2026); the rule did not change.
 */

/** Anything with a position — a pet option, a tahapan. */
export interface Ordered {
  sortOrder: number;
}

/**
 * The PATCHes that move `live[from]` into `live[to]`'s place, as
 * `[row, sortOrder]` pairs. `live` is one list's undeleted rows in display
 * order, and `to` is a neighbour.
 *
 * A SWAP, TWO REQUESTS, in the ordinary case: the two rows trade `sortOrder`
 * and nothing else moves. Renumbering the whole list on every click would be a
 * request per row for a change that touches two.
 *
 * RENUMBERED WHEN THE TWO ARE EQUAL. Trading a value with its twin changes
 * nothing, and the rows would only look ordered because the display order falls
 * back to the name — so the click would do nothing and say it had. Then every
 * row is written to its position in the new order, skipping the ones already
 * there, which is also what repairs a list that arrived with duplicates.
 */
export function reorderPatches<T extends Ordered>(
  live: readonly T[],
  from: number,
  to: number,
): Array<[T, number]> {
  const moving = live[from];
  const neighbour = live[to];

  if (moving.sortOrder !== neighbour.sortOrder) {
    return [
      [moving, neighbour.sortOrder],
      [neighbour, moving.sortOrder],
    ];
  }

  const next = [...live];
  [next[from], next[to]] = [neighbour, moving];

  return next.flatMap((row, position): Array<[T, number]> =>
    row.sortOrder === position ? [] : [[row, position]],
  );
}
