import type { Metadata } from "next";

import { HotelBookingsScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking · Hotel · Buloo" };

/** A stay is a booking — the Booking tab answers to `bookings:read`. */
export default function HotelBookingsPage() {
  return (
    <RequirePermission feature="bookings">
      <HotelBookingsScreen />
    </RequirePermission>
  );
}
