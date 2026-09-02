import type { Metadata } from "next";

import { BookingDetailScreen, BOOKING_CRUMBS } from "@/features/booking";
import { PageHeading } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail Booking · Buloo" };

/**
 * One booking, whole.
 *
 * GATED ON `read`. Moving it along the ladder is `update`, and the actions on
 * the page carry that gate themselves — so a groomer who may read the day sheet
 * can open a booking and see the allergy list without being able to reschedule
 * it.
 *
 * DECLARED AFTER the static segments in the filesystem, but Next matches static
 * ahead of dynamic regardless — "new", "kalender" and "availability" are never
 * read as booking ids.
 *
 * `params` is a Promise in this version of Next, awaited here so the screen
 * stays a client component that only receives the id.
 */
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="read">
      <PageHeading
        crumbs={[...BOOKING_CRUMBS, { label: "Detail" }]}
        title="Detail booking"
      >
        Satu kunjungan, dengan tiap hewan dan status tagihannya masing-masing.
      </PageHeading>
      <BookingDetailScreen id={id} />
    </RequirePermission>
  );
}
