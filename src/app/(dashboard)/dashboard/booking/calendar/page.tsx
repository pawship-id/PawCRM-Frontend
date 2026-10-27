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
 * `calendar` since 26 October 2026 (was `kalender`): routes are in English,
 * labels stay Indonesian.
 */
export default function BookingCalendarPage() {
  return (
    <RequirePermission feature="bookings" action="read">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[...BOOKING_CRUMBS, { label: "Kalender" }]}
          title="Kalender booking"
        >
          Satu blok adalah satu tahap pekerjaan pada satu booking. Tahap yang
          dikerjakan groomer berbeda muncul di kolom masing-masing.
        </PageHeading>
        <BookingCalendarScreen />
      </div>
    </RequirePermission>
  );
}
