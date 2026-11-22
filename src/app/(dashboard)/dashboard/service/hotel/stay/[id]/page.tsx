import type { Metadata } from "next";

import { HotelStayDetailScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Booking hotel · Buloo" };

/** `params` is a Promise in this version of Next. */
export default async function HotelStayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission feature="bookings">
      <HotelStayDetailScreen stayId={id} />
    </RequirePermission>
  );
}
