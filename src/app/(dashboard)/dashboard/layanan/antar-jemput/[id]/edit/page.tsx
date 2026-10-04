import type { Metadata } from "next";

import { AntarJemputBookingForm } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah booking antar-jemput · Buloo" };

/** Correcting one ride — the booking form, loaded with it. */
export default async function EditAntarJemputPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="update">
      <AntarJemputBookingForm bookingId={id} />
    </RequirePermission>
  );
}
