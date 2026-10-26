/**
 * The Grooming module's tabs — each its own route (see `PageTabs`).
 *
 * THE MODULE'S OWN ADDRESS IS RINGKASAN (13 October 2026, on request): the
 * rail's Grooming row opens on the period's performance, and the booking board
 * moved one segment down to `/booking`.
 */
export const GROOMING_PATH = "/dashboard/service/grooming";
/** The booking board — the Booking tab. */
export const GROOMING_BOOKINGS_PATH = `${GROOMING_PATH}/booking`;
export const GROOMING_CATALOG_PATH = `${GROOMING_PATH}/catalog`;
export const GROOMING_SETTINGS_PATH = `${GROOMING_PATH}/settings`;

/**
 * Taking grooming bookings — from `buloo-booking-v2.html`, "Booking baru" only.
 * NO TABS on it: it is a form reached from the Booking tab, not a fourth tab.
 * `/dashboard/booking/new` stays for every other line of business.
 */
export const GROOMING_NEW_BOOKING_PATH = `${GROOMING_PATH}/new`;

/**
 * One service's detail page — UNDER Layanan & Harga, so `PageTabs`' prefix
 * match keeps that tab lit while a service is open.
 */
export function groomingServicePath(serviceId: string): string {
  return `${GROOMING_CATALOG_PATH}/${serviceId}`;
}
