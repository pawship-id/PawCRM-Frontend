import type { Metadata } from "next";

import { GroomingSummaryScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";
import { GROOMING_TABS } from "@/features/grooming/tabs";

export const metadata: Metadata = { title: "Ringkasan Grooming · Buloo" };

/** Layanan › Grooming › Ringkasan — gated like the Booking tab it sits beside. */
export default function GroomingSummaryPage() {
  return (
    <RequirePermission feature="serviceSummary" redirectTo={GROOMING_TABS}>
      <GroomingSummaryScreen />
    </RequirePermission>
  );
}
