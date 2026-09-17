import type { Crumb } from "@/components";

/**
 * The trail every Booking page hangs its heading from.
 *
 * Declared once so the screens cannot drift into two spellings of the same
 * ancestor — the same reason `features/sales/crumbs.ts` exists.
 *
 * "LAYANAN › KALENDER", matching the rail (renamed from Hari Ini on 17 September
 * 2026). The module's landing page is the day board, and it is called Kalender
 * everywhere a person can read it — a trail saying "Booking" would name the same address a second way.
 */
export const BOOKING_CRUMBS: Crumb[] = [
  { label: "Layanan" },
  { label: "Kalender", href: "/dashboard/booking" },
];

/** The board itself — current page, so the last crumb carries no href. */
export const TODAY_CRUMBS: Crumb[] = [
  { label: "Layanan" },
  { label: "Kalender" },
];
