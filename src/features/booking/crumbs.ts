import type { Crumb } from "@/components";

/**
 * The trail every Booking page hangs its heading from.
 *
 * Declared once so the screens cannot drift into two spellings of the same
 * ancestor — the same reason `features/sales/crumbs.ts` exists.
 *
 * TWO DEEP, NOT THREE. The module's landing page IS the list, so a middle crumb
 * would have nothing to point at but the page you are already on.
 */
export const BOOKING_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Booking", href: "/dashboard/booking" },
];

/** The list itself — current page, so the last crumb carries no href. */
export const BOOKINGS_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Booking" },
];
