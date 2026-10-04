import type { Metadata } from "next";

import { AntarJemputServicesScreen } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Layanan & Harga · Antar-Jemput · Buloo",
};

export default function AntarJemputCatalogPage() {
  return (
    <RequirePermission feature="services">
      <AntarJemputServicesScreen />
    </RequirePermission>
  );
}
