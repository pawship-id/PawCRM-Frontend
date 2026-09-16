import type { Crumb } from "@/components";

/**
 * The trail every Booking page hangs its heading from.
 *
 * Declared once so the screens cannot drift into two spellings of the same
 * ancestor — the same reason `features/sales/crumbs.ts` exists.
 *
 * "LAYANAN › HARI INI", matching the rail and the mockup. The module's landing
 * page is the day board, and it is called Hari Ini everywhere a person can read
 * it — a trail saying "Booking" would name the same address a second way.
 */
export const BOOKING_CRUMBS: Crumb[] = [
  { label: "Layanan" },
  { label: "Hari Ini", href: "/dashboard/booking" },
];

/** The board itself — current page, so the last crumb carries no href. */
export const TODAY_CRUMBS: Crumb[] = [
  { label: "Layanan" },
  { label: "Hari Ini" },
];
