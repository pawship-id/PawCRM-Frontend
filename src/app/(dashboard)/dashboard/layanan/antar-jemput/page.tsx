import type { Metadata } from "next";

import { AntarJemputBookingsScreen } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Antar-Jemput · Buloo" };

/** The Booking tab — rides, one direction each (21 September 2026). */
export default function AntarJemputPage() {
  return (
    <RequirePermission feature="bookings">
      <AntarJemputBookingsScreen />
    </RequirePermission>
  );
}
