/** The Antar-Jemput module's three tabs — each its own route, as Grooming's. */
export const ANTAR_JEMPUT_PATH = "/dashboard/layanan/antar-jemput";
export const ANTAR_JEMPUT_CATALOG_PATH = `${ANTAR_JEMPUT_PATH}/katalog`;
export const ANTAR_JEMPUT_SETTINGS_PATH = `${ANTAR_JEMPUT_PATH}/pengaturan`;

/** Booking a ride — a form reached from the Booking tab, not a fourth tab. */
export const ANTAR_JEMPUT_NEW_PATH = `${ANTAR_JEMPUT_PATH}/new`;

/**
 * A ride for somebody's other booking — "+ Antar-jemput" on a booking's page.
 * The form reads the customer, the animal, the branch and the day off it, and
 * joins its visit.
 */
export function antarJemputForBookingPath(bookingId: string): string {
  return `${ANTAR_JEMPUT_NEW_PATH}?bookingId=${encodeURIComponent(bookingId)}`;
}

/** Correcting a ride — the same form, loaded with it. */
export function antarJemputEditPath(bookingId: string): string {
  return `${ANTAR_JEMPUT_PATH}/${bookingId}/edit`;
}

/** `?dari=` the service form takes to come back to this module's catalogue. */
export const ANTAR_JEMPUT_FORM_ORIGIN = "antar-jemput";
