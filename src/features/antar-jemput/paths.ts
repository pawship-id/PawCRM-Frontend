/** The Antar-Jemput module's three tabs — each its own route, as Grooming's. */
export const ANTAR_JEMPUT_PATH = "/dashboard/layanan/antar-jemput";
export const ANTAR_JEMPUT_CATALOG_PATH = `${ANTAR_JEMPUT_PATH}/katalog`;
export const ANTAR_JEMPUT_SETTINGS_PATH = `${ANTAR_JEMPUT_PATH}/pengaturan`;

/** Booking a ride — a form reached from the Booking tab, not a fourth tab. */
export const ANTAR_JEMPUT_NEW_PATH = `${ANTAR_JEMPUT_PATH}/new`;

/**
 * A ride for somebody's other booking. The form reads the customer, the animal,
 * the branch and the day off it, and joins its visit.
 *
 * ⚠️ NOTHING LINKS HERE SINCE 24 September 2026. "+ Antar-jemput" on Booking
 * terkait was the only entrance and the shop asked for it off: once a booking
 * is created, nothing is added to it from its own page. The route and the
 * form's `?bookingId=` handling are kept on purpose — they are the feature, not
 * the button — so restoring the entrance is one line in `BookingRelatedCard`.
 * Do not delete either as dead code.
 */
export function antarJemputForBookingPath(bookingId: string): string {
  return `${ANTAR_JEMPUT_NEW_PATH}?bookingId=${encodeURIComponent(bookingId)}`;
}

/** Correcting a ride — the same form, loaded with it. */
export function antarJemputEditPath(bookingId: string): string {
  return `${ANTAR_JEMPUT_PATH}/${bookingId}/edit`;
}

/**
 * ONE RIDE, WHOLE — `/dashboard/layanan/antar-jemput/:bookingId`
 * (23 September 2026, on request).
 *
 * A ride does NOT open at `/dashboard/booking/:id`. That page is built round an
 * animal and its grooming — the pet profile, the belongings, the sessions of
 * one dog — and a van has none of those: it has two ends, a direction, a driver
 * and the bookings it serves. Two different documents were sharing one page.
 */
export function antarJemputDetailPath(bookingId: string): string {
  return `${ANTAR_JEMPUT_PATH}/${bookingId}`;
}

/**
 * WHERE THIS BOOKING'S OWN PAGE IS — the one helper every link should use.
 *
 * `tripLeg` is the marker everywhere else in the system, and it is the marker
 * here: a ride goes to the module's page, everything else to the booking's.
 * Kept in ONE place so a screen that gains rides later routes correctly without
 * being found and edited — and so nothing has to remember which of two URLs a
 * given row wants.
 *
 * ⚠️ A CALLER WITHOUT `tripLeg` GETS THE ORDINARY PAGE, which is correct rather
 * than merely safe: `/dashboard/booking/:id` redirects a ride to the module's
 * page once it has read it. The link is right either way; passing `tripLeg`
 * only spares the reader a redirect.
 */
export function bookingDetailPath(
  booking: { _id: string; tripLeg?: string | null },
): string {
  return booking.tripLeg
    ? antarJemputDetailPath(booking._id)
    : `/dashboard/booking/${booking._id}`;
}
