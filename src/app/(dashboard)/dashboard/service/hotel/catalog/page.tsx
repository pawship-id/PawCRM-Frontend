import type { Metadata } from "next";

import { HotelServicesScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Layanan & Harga · Hotel · Buloo" };

export default function HotelCatalogPage() {
  return (
    <RequirePermission feature="services">
      <HotelServicesScreen />
    </RequirePermission>
  );
}
