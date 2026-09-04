import type { Metadata } from "next";

import { BookingCalendarScreen, BOOKING_CRUMBS } from "@/features/booking";
import { PageHeading } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kalender Booking · Buloo" };

/**
 * The day sheet, drawn — PCR-042 / FR-3.
 *
 * GATED ON `read`. A calendar is something to look at; putting work on it is
 * done from the booking form, which has its own gate.
 *
 * `kalender` RATHER THAN `calendar`, matching `keuangan` and `layanan`
 * elsewhere in this app: the routes people read are in the language they speak.
 */
export default function BookingCalendarPage() {
  return (
    <RequirePermission feature="bookings" action="read">
      <PageHeading
        crumbs={[...BOOKING_CRUMBS, { label: "Kalender" }]}
        title="Kalender booking"
      >
        Satu blok adalah satu hewan yang sedang dikerjakan. Kunjungan yang
        membawa dua hewan muncul di dua kolom sekaligus.
      </PageHeading>
      <BookingCalendarScreen />
    </RequirePermission>
  );
}
