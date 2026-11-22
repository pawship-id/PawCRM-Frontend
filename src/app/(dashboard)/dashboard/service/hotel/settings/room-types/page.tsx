import type { Metadata } from "next";

import { HotelRoomTypesScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Tipe kamar · Hotel · Buloo" };

/** Room types are part of the hotel catalogue — `services`, like zones. */
export default function HotelRoomTypesPage() {
  return (
    <RequirePermission feature="services">
      <HotelRoomTypesScreen />
    </RequirePermission>
  );
}
