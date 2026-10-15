import type { Metadata } from "next";

import { AntarJemputBookingsScreen } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";
import { ANTAR_JEMPUT_TABS } from "@/features/antar-jemput/tabs";

export const metadata: Metadata = { title: "Antar-Jemput · Buloo" };

/** The Booking tab — rides, one direction each (21 September 2026). */
export default function AntarJemputPage() {
  return (
    <RequirePermission feature="bookings" redirectTo={ANTAR_JEMPUT_TABS}>
      <AntarJemputBookingsScreen />
    </RequirePermission>
  );
}
