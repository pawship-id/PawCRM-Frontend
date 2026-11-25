import type { Metadata } from "next";

import { HotelStayEditScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah booking hotel · Buloo" };

export default async function HotelStayEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission feature="bookings" action="update">
      <HotelStayEditScreen stayId={id} />
    </RequirePermission>
  );
}
