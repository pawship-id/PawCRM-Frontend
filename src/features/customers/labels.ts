/**
 * Small formatting helpers and option lists shared across the customers
 * feature's screens.
 *
 * PROMOTED FROM `CustomerSummaryScreen.tsx` (2 October 2026) the day
 * `DormantCustomersScreen` — the Ringkasan panel's "Lihat semua" — needed the
 * same windows and the same date format, which is the rule for promotion
 * (§14): a copy here would have started drifting from the panel's.
 */

/** The dormancy windows the Ringkasan panel offers, matching the mockup's own select. */
export const DORMANT_DAYS = [30, 60, 90, 120, 150].map((days) => ({
  value: days,
  label: `${days} hari`,
}));

/** "12 Jan 2025" — the one date format every customer worklist reads in. */
export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
