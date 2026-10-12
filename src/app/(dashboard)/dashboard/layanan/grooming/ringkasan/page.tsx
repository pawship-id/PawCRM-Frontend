import type { Metadata } from "next";

import { GroomingSummaryScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ringkasan Grooming · Buloo" };

/** Layanan › Grooming › Ringkasan — gated like the Booking tab it sits beside. */
export default function GroomingSummaryPage() {
  return (
    <RequirePermission feature="bookings">
      <GroomingSummaryScreen />
    </RequirePermission>
  );
}
