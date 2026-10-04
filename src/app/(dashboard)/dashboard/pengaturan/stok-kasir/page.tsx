import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { StockCashierSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Stok & Kasir · Pengaturan · Buloo" };

/** Gated on `tenants:read`, the grant GET /api/tenants/me enforces. */
export default function StockCashierSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <StockCashierSettingsScreen />
    </RequirePermission>
  );
}
