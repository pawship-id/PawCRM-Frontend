import type { Metadata } from "next";

import { AntarJemputBookingForm } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking antar-jemput baru · Buloo" };

/**
 * Booking a ride. `?bookingId=` is "+ Antar-jemput" on another booking's page:
 * the form starts from that booking and joins its visit.
 */
export default async function NewAntarJemputPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookingId } = await searchParams;

  return (
    <RequirePermission feature="bookings" action="create">
      <AntarJemputBookingForm
        fromBookingId={typeof bookingId === "string" ? bookingId : undefined}
      />
    </RequirePermission>
  );
}
