/**
 * Relative-date helpers for the stock screens.
 *
 * DELIBERATELY MODULE-LEVEL FUNCTIONS, not inline expressions in a component.
 * `Date.now()` is impure, so calling it directly in a render body trips
 * `react-hooks/purity` — and the rule is right that a value which changes on
 * every render is a hazard. Keeping the clock read inside a named helper is the
 * same shape `UsersTable.isLocked` already uses for the lockout badge, and it
 * confines the impurity to one line that a reader can find.
 *
 * These drive badges, not decisions: an expiry countdown that is one day stale
 * because a tab was left open costs nothing, whereas the alternative — plumbing
 * a clock through three screens — would cost every component a prop it does not
 * otherwise need.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from now until `date`. Negative when the date has already passed,
 * which is the case that matters most: stock that expired last week and is
 * still sellable on the shelf is the most urgent thing this module can report,
 * and clamping it to zero would hide how long it has been wrong.
 */
export function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / MS_PER_DAY);
}

/** True when `date` falls within the next `days` — expired dates included. */
export function expiresWithin(date: string | null, days: number): boolean {
  if (!date) return false;
  return daysUntil(date) <= days;
}
