import { bookingService } from "@/services/booking.service";
import type { Booking, BookingListQuery } from "@/types/api";

/** The API's page cap. */
const PAGE_LIMIT = 100;

/**
 * 2.000 bookings in one range. Past that a board says its numbers are partial
 * rather than quietly summing the first pages.
 */
export const MAX_BOOKING_PAGES = 20;

/**
 * Every booking in a range, paged out and deduped.
 *
 * WHY A BOARD READS THE WHOLE RANGE. `GET /bookings` cannot be asked for one
 * line of business — the line is known only from the booking's service — so a
 * screen that shows work per line fetches the range and groups it itself. The
 * upside is that every number on the screen comes from the same array.
 *
 * DEDUPED BY ID. A booking made while the pages are in flight shifts every later
 * page by one, and the row on the boundary would otherwise be counted twice.
 *
 * SHARED BY BOTH BOARDS — Hari Ini and Grooming.
 */
export async function listAllBookings(
  query: BookingListQuery,
): Promise<{ bookings: Booking[]; truncated: boolean }> {
  const first = await bookingService.list({ ...query, page: 1, limit: PAGE_LIMIT });
  const pages = Math.min(first.pagination.totalPages, MAX_BOOKING_PAGES);

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      bookingService.list({ ...query, page: index + 2, limit: PAGE_LIMIT }),
    ),
  );

  const seen = new Map<string, Booking>();
  for (const result of [first, ...rest]) {
    for (const booking of result.items) seen.set(booking._id, booking);
  }

  return {
    bookings: [...seen.values()],
    truncated: first.pagination.totalPages > MAX_BOOKING_PAGES,
  };
}
