import type { Metadata } from "next";

import { BookingForm, BOOKING_CRUMBS } from "@/features/booking";
// Not from `@/components` — `PageHeading` is still a purchasing-local component
// awaiting promotion (ui-rules §15). The sales pages import it from the same
// place; a second copy is what that migration list exists to prevent.
import { PageHeading } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking Baru · Buloo" };

/**
 * Taking a booking — PCR-041.
 *
 * A PAGE RATHER THAN A DIALOG ON THE LIST, and it was the second of those until
 * a booking could hold several animals. Three animals is three cards of five
 * controls each; a dialog holding that is a form scrolling inside a scrolling
 * page, with the save button and the running total sliding out of reach of the
 * fields they describe.
 *
 * GATED ON `create`, NOT `read`. A booking consumes a number from the branch's
 * series the moment it leaves draft, and the till bills from it; a role that may
 * read the day sheet has no business writing one.
 *
 * DECLARED BESIDE the list rather than under an `[id]`, so Next matches "new"
 * statically and it can never be read as a booking id.
 */
export default function NewBookingPage() {
  return (
    <RequirePermission feature="bookings" action="create">
      {/* BARE TEXT, not a <p>. `PageHeading` already wraps its children in one,
          and nesting a second produces invalid HTML that React reports as a
          hydration error. */}
      <PageHeading crumbs={[...BOOKING_CRUMBS, { label: "Booking baru" }]} title="Booking baru">
        Satu kunjungan, satu booking. Beberapa hewan sekaligus boleh — tambahkan
        barisnya di bawah.
      </PageHeading>
      <BookingForm />
    </RequirePermission>
  );
}
