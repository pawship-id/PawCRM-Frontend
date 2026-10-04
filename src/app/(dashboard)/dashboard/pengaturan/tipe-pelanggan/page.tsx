import type { Metadata } from "next";

import { CustomerTypesScreen } from "@/features/settings";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Tipe Pelanggan · Pengaturan · Buloo",
};

/** Gated on `customerTypes:read`, the grant `GET /api/customer-types` enforces. */
export default function CustomerTypesPage() {
  return (
    <RequirePermission feature="customerTypes">
      <CustomerTypesScreen />
    </RequirePermission>
  );
}
