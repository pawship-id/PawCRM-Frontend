import type { Metadata } from "next";

import { HotelSummaryScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ringkasan Hotel · Buloo" };

/** Layanan › Hotel › Ringkasan — the hotel's own grant. */
export default function HotelPage() {
  return (
    <RequirePermission feature="hotel">
      <HotelSummaryScreen />
    </RequirePermission>
  );
}
