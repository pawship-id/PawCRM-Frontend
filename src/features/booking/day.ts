/**
 * Dates and clocks for the booking screens, in THE BROWSER'S OWN ZONE — which
 * is the shop's.
 *
 * ⚠️ `toISOString().slice(0, 10)` IS WRONG HERE and the rest of this codebase's
 * habit of writing it is why this file exists. It converts to UTC first, so east
 * of Greenwich the date goes BACKWARDS: in Jakarta (UTC+7) "besok" computed that
 * way lands on today, and a calendar's next-day button moves nothing at all.
 *
 * Everywhere else in this app a date is a bookkeeping field somebody reads and
 * corrects. On these screens it is the axis the whole thing is drawn on.
 *
 * PURE, so the grouping that reads it is tested without a DOM.
 */

/** Monday first — the shop's week, not the calendar app's. */
export const WEEKDAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** A Date as `yyyy-mm-dd`, from LOCAL parts. */
export function isoDate(at: Date): string {
  const month = `${at.getMonth() + 1}`.padStart(2, "0");
  const day = `${at.getDate()}`.padStart(2, "0");

  return `${at.getFullYear()}-${month}-${day}`;
}

/** Today, as the board's anchor. */
export function todayIso(): string {
  return isoDate(new Date());
}

/** `yyyy-mm-ddT…` from the API, as the calendar day it falls on locally. */
export function dayKeyOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : isoDate(at);
}

/** Midnight local on a `yyyy-mm-dd` — never `new Date("2026-09-11")`, which is UTC. */
function atMidnight(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function addDays(value: string, days: number): string {
  const at = atMidnight(value);
  at.setDate(at.getDate() + days);
  return isoDate(at);
}

/**
 * Whole months, FROM THE FIRST — so stepping off the 31st never skips a month
 * the way `setMonth` alone does (31 March + 1 = 1 May).
 */
export function addMonths(value: string, months: number): string {
  const at = atMidnight(value);
  at.setDate(1);
  at.setMonth(at.getMonth() + months);
  return isoDate(at);
}

/** The Monday of the week `value` falls in. */
export function startOfWeek(value: string): string {
  const at = atMidnight(value);
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
  return isoDate(at);
}

export function startOfMonth(value: string): string {
  const at = atMidnight(value);
  return isoDate(new Date(at.getFullYear(), at.getMonth(), 1));
}

export function endOfMonth(value: string): string {
  const at = atMidnight(value);
  return isoDate(new Date(at.getFullYear(), at.getMonth() + 1, 0));
}

/**
 * The 42 cells a month grid draws — six Monday-first weeks.
 *
 * SIX ALWAYS, never five: a grid that changed height between months makes
 * everything under it jump, and February starting on a Monday is the one month
 * that would.
 */
export function monthGrid(value: string): string[] {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** True when the day is outside the month `anchor` sits in. */
export function outsideMonth(day: string, anchor: string): boolean {
  return day.slice(0, 7) !== anchor.slice(0, 7);
}

/** Minutes past midnight, local. */
export function minutesOf(iso: string): number {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 0 : at.getHours() * 60 + at.getMinutes();
}

/** "09.00" — the shop's clock, never through UTC. */
export function clockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";

  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

/** "13 Sep". */
export function dayOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "—" : DAY_FORMAT.format(at);
}

const LONG_DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "Jumat, 11 September 2026" — the day bar's title. */
export function longDayOf(value: string): string {
  return LONG_DAY_FORMAT.format(atMidnight(value));
}

const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
});

/** "September 2026" — the month bar's title. */
export function monthTitleOf(value: string): string {
  return MONTH_FORMAT.format(atMidnight(value));
}

const MONTH_ONLY_FORMAT = new Intl.DateTimeFormat("id-ID", { month: "long" });

/**
 * "8 – 14 September 2026", and "31 Agustus – 6 September 2026" when the week
 * straddles two months.
 *
 * THE YEAR IS SAID ONCE, at the end, and so is the month when both ends share
 * it. A title repeating "2026" twice is a title people stop reading. The year
 * comes back to the front only for the one week a year that crosses it, where
 * leaving it off would be wrong rather than terse.
 */
export function weekTitleOf(from: string): string {
  const start = atMidnight(from);
  const end = atMidnight(addDays(from, 6));
  const tail = MONTH_FORMAT.format(end);

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${tail}`;
  }

  const head =
    start.getFullYear() === end.getFullYear()
      ? MONTH_ONLY_FORMAT.format(start)
      : MONTH_FORMAT.format(start);

  return `${start.getDate()} ${head} – ${end.getDate()} ${tail}`;
}

/** "4j 30m", "45m", "8j" — never "0j 0m". */
export function hoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}j`;
  return `${hours}j ${rest}m`;
}
