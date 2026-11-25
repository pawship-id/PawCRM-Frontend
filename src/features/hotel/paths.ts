/**
 * Layanan › Hotel — each tab its own route, as Grooming's (21 November 2026,
 * PLAN-Hotel-V1.md). The module's own address is Ringkasan.
 */
export const HOTEL_PATH = "/dashboard/service/hotel";
export const HOTEL_BOOKINGS_PATH = `${HOTEL_PATH}/booking`;
export const HOTEL_CATALOG_PATH = `${HOTEL_PATH}/catalog`;
export const HOTEL_SETTINGS_PATH = `${HOTEL_PATH}/settings`;
/** Pengaturan › Tipe kamar — its own list and form, under Pengaturan. */
export const HOTEL_ROOM_TYPES_PATH = `${HOTEL_SETTINGS_PATH}/room-types`;
/** Booking a stay — a form reached from the Booking tab, not a fourth tab. */
export const HOTEL_NEW_BOOKING_PATH = `${HOTEL_PATH}/new`;

export function hotelRoomTypePath(id: string | "new"): string {
  return `${HOTEL_ROOM_TYPES_PATH}/${id}`;
}

/** One stay, whole — `/dashboard/service/hotel/:bookingId`. */
export function hotelBookingPath(bookingId: string): string {
  return `${HOTEL_PATH}/stay/${bookingId}`;
}

export function hotelBookingEditPath(bookingId: string): string {
  return `${HOTEL_PATH}/stay/${bookingId}/edit`;
}
