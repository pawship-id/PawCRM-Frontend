/**
 * Dates and clocks for the groomer app, in the phone's own timezone — which is
 * the shop's, because a groomer holds the phone in the shop.
 */

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

/** Today as `YYYY-MM-DD`, from the local clock rather than UTC. */
export function todayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Rab" for `2026-09-02`. The key is read as the calendar date it names. */
export function dayName(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return DAY_NAMES[new Date(year, month - 1, day).getDay()];
}

/** The day of the month, "2". */
export function dayNumber(key: string): string {
  return String(Number(key.slice(8, 10)));
}

/** "2 September 2026". */
export function longDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "11.00" — Indonesian clocks use a dot. */
export function clock(iso: string | Date): string {
  return new Date(iso)
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(":", ".");
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(from: string | Date, to: string | Date): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

/** "12:05" for a running timer, from whole seconds. */
export function stopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
