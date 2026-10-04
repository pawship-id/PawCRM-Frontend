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

/**
 * A date as the API's `YYYY-MM-DD`, read from LOCAL parts.
 *
 * NEVER `toISOString().slice(0, 10)`, which is the obvious one-liner and is
 * wrong east of Greenwich: a shop in WIB asking "what expires today" before
 * 07:00 would send yesterday, and on the first of a month, last month. The
 * fields these bound (`expiryDate`, `entryDate`, `opnameDate`) are plain
 * calendar days with no timezone of their own, so the browser's own calendar is
 * the right one to read them from.
 */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The calendar day `days` from now, as `YYYY-MM-DD`. Negative goes backwards.
 *
 * Reads the clock, so it lives here beside the other impure helpers rather than
 * inline in a render body — see the note at the top of this file. Day arithmetic
 * goes through the Date constructor rather than adding milliseconds, so the two
 * days a year that are 23 or 25 hours long cannot shift the answer.
 */
export function isoDaysFromToday(days: number, from = new Date()): string {
  return isoDate(
    new Date(from.getFullYear(), from.getMonth(), from.getDate() + days),
  );
}

/* ------------------------------------------------- a range as one phrase */

/** `9` → `Sep`, in the module's own month vocabulary (the table's dates use it). */
function monthShort(month: number): string {
  return new Date(2026, month - 1, 1).toLocaleDateString("id-ID", {
    month: "short",
  });
}

function partsOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function fullDate(date: string): string {
  const { year, month, day } = partsOf(date);
  return `${day} ${monthShort(month)} ${year}`;
}

/**
 * Two calendar days as one short phrase, sharing what they share.
 *
 *   same day    → `11 Sep 2026`
 *   same month  → `1–30 Sep 2026`
 *   same year   → `31 Agu – 6 Sep 2026`
 *   otherwise   → `28 Des 2026 – 3 Jan 2027`
 *
 * READS `yyyy-mm-dd` STRINGS, NEVER INSTANTS. The day a range starts on is the
 * tenant's calendar day; a `Date` formatted in the reader's timezone would name
 * the day before for anybody west of the shop.
 */
export function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Semua tanggal";
  if (from && !to) return `Sejak ${fullDate(from)}`;
  if (!from && to) return `Sampai ${fullDate(to)}`;

  const a = partsOf(from!);
  const b = partsOf(to!);

  if (from === to) return fullDate(from!);
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}–${b.day} ${monthShort(b.month)} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${monthShort(a.month)} – ${b.day} ${monthShort(b.month)} ${b.year}`;
  }
  return `${fullDate(from!)} – ${fullDate(to!)}`;
}
