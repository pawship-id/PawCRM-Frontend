import { OPERATING_DAYS, type Branch, type OperatingDay } from "@/types/api";

/**
 * WHEN A BRANCH IS OPEN, in words — shared by the branch form, the branch list
 * and the tenant profile so the three cannot drift (22 September 2026).
 *
 * THE DATABASE STORES DAY CODES, THIS PRINTS A RANGE. `["mon","tue","wed","thu",
 * "fri","sat"]` reads as "Senin – Sabtu", which is how a shop says it and what
 * the mockup draws — but a shop closed on Wednesday AND Sunday is not a range,
 * so a run that is not contiguous is listed instead of forced into one. Storing
 * the sentence would have made the list unreadable to the booking validator that
 * will read these.
 */

const LONG: Record<OperatingDay, string> = {
  mon: "Senin",
  tue: "Selasa",
  wed: "Rabu",
  thu: "Kamis",
  fri: "Jumat",
  sat: "Sabtu",
  sun: "Minggu",
};

const SHORT: Record<OperatingDay, string> = {
  mon: "Sen",
  tue: "Sel",
  wed: "Rab",
  thu: "Kam",
  fri: "Jum",
  sat: "Sab",
  sun: "Min",
};

export const DAY_LABELS = LONG;

/** The codes in week order, whatever order they were stored or ticked in. */
export function sortDays(days: readonly OperatingDay[]): OperatingDay[] {
  return OPERATING_DAYS.filter((day) => days.includes(day));
}

/**
 * "Senin – Sabtu", "Sen, Rab, Jum", or null when no day was recorded.
 *
 * Week order is Monday-first, which is why Sunday-plus-Monday is NOT treated as
 * contiguous: a shop open Sunday and Monday only would read as "Minggu – Senin",
 * which anybody would take for "every day from Sunday to Monday".
 */
export function formatOperatingDays(
  days: readonly OperatingDay[] | undefined,
): string | null {
  const ordered = sortDays(days ?? []);
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return LONG[ordered[0]];

  const first = OPERATING_DAYS.indexOf(ordered[0]);
  const contiguous = ordered.every(
    (day, index) => OPERATING_DAYS.indexOf(day) === first + index,
  );

  return contiguous
    ? `${LONG[ordered[0]]} – ${LONG[ordered[ordered.length - 1]]}`
    : ordered.map((day) => SHORT[day]).join(", ");
}

/** "09:00 – 20:00", or null when the pair was never recorded. */
export function formatHours(
  openTime: string | null | undefined,
  closeTime: string | null | undefined,
): string | null {
  return openTime && closeTime ? `${openTime} – ${closeTime}` : null;
}

/**
 * One line for a branch's hours, or null when it has recorded none of it.
 *
 * NULL MEANS UNRECORDED, NOT CLOSED, and the caller says so in its own words —
 * a list of branches and a profile panel want different sentences for "nobody
 * has filled this in yet".
 */
export function branchHoursSummary(branch: Branch): string | null {
  const hours = formatHours(branch.openTime, branch.closeTime);
  const days = formatOperatingDays(branch.operatingDays);

  return [hours, days].filter(Boolean).join(" · ") || null;
}
