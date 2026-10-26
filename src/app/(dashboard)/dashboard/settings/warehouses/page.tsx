import type { Metadata } from "next";

import { WarehousesScreen } from "@/features/warehouses";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Gudang · Pengaturan · Buloo",
};

export default function MasterWarehousesPage() {
  return (
    <RequirePermission feature="warehouses">
      <WarehousesScreen />
    </RequirePermission>
  );
}
