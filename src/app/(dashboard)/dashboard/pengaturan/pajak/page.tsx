import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { TaxSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Pajak · Pengaturan · Buloo" };

/** Gated on `tenants:read`, the grant GET /api/tenants/me enforces. */
export default function TaxSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <TaxSettingsScreen />
    </RequirePermission>
  );
}
