import type { Metadata } from "next";

import { BookingForm, BOOKING_CRUMBS } from "@/features/booking";
// Not from `@/components` — `PageHeading` is still a purchasing-local component
// awaiting promotion (ui-rules §15).
import { PageHeading } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah Booking · Buloo" };

/**
 * Correcting a booking — the same form that took it.
 *
 * WHAT MAY BE CHANGED: the owner, the animals and their services, the groomers,
 * the time, the branch, the notes. WHAT MAY NOT: the status, which moves through
 * the buttons on the booking's own page because a transition has rules a `$set`
 * cannot express; and any grooming already pulled to a basket or a bill.
 *
 * GATED ON `update`, NOT `create`. Reception may take bookings all day and still
 * have no business rewriting one somebody else agreed — and `update` is the
 * grant that repricing a visit actually costs.
 *
 * THE SERVER IS THE ONE THAT REFUSES. A completed or cancelled booking answers
 * 409 here, a billed row cannot be removed, and the clash and leave checks run
 * again with this booking excluded from its own comparison (kriteria 4.8). This
 * page makes those refusals legible; it is never the thing enforcing them.
 */
export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="update">
      <PageHeading
        crumbs={[...BOOKING_CRUMBS, { label: "Ubah booking" }]}
        title="Ubah booking"
      >
        Ubah jadwal, layanan, atau groomer-nya. Layanan yang sudah ditagih
        terkunci.
      </PageHeading>
      <BookingForm bookingId={id} />
    </RequirePermission>
  );
}
