/** The Grooming module's three tabs — each its own route (see `PageTabs`). */
export const GROOMING_PATH = "/dashboard/layanan/grooming";
export const GROOMING_CATALOG_PATH = `${GROOMING_PATH}/katalog`;
export const GROOMING_SETTINGS_PATH = `${GROOMING_PATH}/pengaturan`;

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
