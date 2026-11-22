import { Suspense } from "react";
import type { Metadata } from "next";

import { Spinner } from "@/components";
import { HotelStayCreateScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking hotel baru · Buloo" };

/** Suspense, because the form reads `?roomTypeId&unitId&date` from the room board. */
export default function HotelNewBookingPage() {
  return (
    <RequirePermission feature="bookings" action="create">
      <Suspense fallback={<Spinner />}>
        <HotelStayCreateScreen />
      </Suspense>
    </RequirePermission>
  );
}
