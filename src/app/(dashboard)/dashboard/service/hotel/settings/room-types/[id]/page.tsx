import type { Metadata } from "next";

import { HotelRoomTypeForm } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Tipe kamar · Hotel · Buloo" };

/** `/new` opens an empty form; an id opens that room type. */
export default async function HotelRoomTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission feature="services">
      <HotelRoomTypeForm roomTypeId={id === "new" ? null : id} />
    </RequirePermission>
  );
}
