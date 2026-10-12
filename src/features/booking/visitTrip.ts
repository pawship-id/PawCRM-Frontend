import { subtractDecimals, sumDecimals } from "@/utils/decimal";
import type { Booking, BookingVisitTrip } from "@/types/api";

/**
 * THE HOME-VISIT FEE IN A PULL LIST (11 October 2026, on request).
 *
 * The fee is a line on ONE booking of the house, but it pays for the trip, so a
 * list a cashier pulls from draws it once as a row of its own rather than under
 * that booking's grooming — and says so when another booking already took it
 * onto a bill. The server decides which (`visitTrip`); these helpers only add up.
 */

export type OwedTrip = Extract<BookingVisitTrip, { state: "unbilled" }>;

/** What a booking adds for its grooming alone — its own fee line left out. */
export function groomingTotalOf(booking: Booking): string {
  const addons = booking.service.addons ?? [];
  const total =
    booking.netAmount ??
    booking.totalAmount ??
    sumDecimals([booking.service.price, ...addons.map((addon) => addon.price)]);
  const fee = sumDecimals(
    addons
      .filter((addon) => addon.visitFee)
      .map((addon) => subtractDecimals(addon.price, addon.discountAmount ?? "0")),
  );

  return subtractDecimals(total, fee);
}

/** Each fee still owed, once, in the order its first booking appears. */
export function owedTripsOf(bookings: Booking[]): OwedTrip[] {
  const seen = new Map<string, OwedTrip>();

  for (const booking of bookings) {
    const trip = booking.visitTrip;
    if (trip?.state === "unbilled" && !seen.has(trip.key)) seen.set(trip.key, trip);
  }

  return [...seen.values()];
}

/** The keys of the owed trips the chosen bookings bring along. */
export function tripKeysOf(bookings: Booking[]): Set<string> {
  return new Set(
    bookings.flatMap((booking) =>
      booking.visitTrip?.state === "unbilled" ? [booking.visitTrip.key] : [],
    ),
  );
}

/** What pulling `chosen` adds to the bill: every grooming, and each owed trip once. */
export function pullTotalOf(chosen: Booking[]): string {
  const keys = tripKeysOf(chosen);

  return sumDecimals([
    ...chosen.map(groomingTotalOf),
    ...owedTripsOf(chosen)
      .filter((trip) => keys.has(trip.key))
      .map((trip) => trip.amount),
  ]);
}

/** "Sudah ditagih di BK-261011-001 (Cilang)" — the note on a booking whose trip was billed. */
export function billedTripNote(trip: BookingVisitTrip | null | undefined): string | null {
  if (trip?.state !== "billed") return null;

  const where = [trip.carrierBookingNumber, trip.carrierPetName ? `(${trip.carrierPetName})` : null]
    .filter(Boolean)
    .join(" ");

  return where
    ? `Biaya perjalanan sudah ditagih di ${where}`
    : "Biaya perjalanan sudah ditagih di booking lain";
}
