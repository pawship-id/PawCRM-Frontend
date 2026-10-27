/** One home-grooming trip — its own page since 11 October 2026. */
export function homeTripPath(tripId: string): string {
  return `/dashboard/booking/rides/${tripId}`;
}
