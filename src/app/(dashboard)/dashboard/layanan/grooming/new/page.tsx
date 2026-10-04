import type { Metadata } from "next";

import { GroomingBookingCreateScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking grooming baru · Buloo" };

/**
 * Taking grooming bookings — "Booking baru" from `buloo-booking-v2.html`.
 *
 * NO MODULE TABS. The mockup's other two tabs (Detail booking, Alur) are not
 * part of this page; the booking's own page already exists.
 *
 * GATED ON `create`, like `/dashboard/booking/new` — which stays for every other
 * line of business.
 */
export default function NewGroomingBookingPage() {
  return (
    <RequirePermission feature="bookings" action="create">
      <GroomingBookingCreateScreen />
    </RequirePermission>
  );
}
