import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { MembershipAccountingSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Membership · Pengaturan · Buloo" };

/** Gated on `tenants:read`, the grant GET /api/tenants/me enforces. */
export default function MembershipAccountingSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <MembershipAccountingSettingsScreen />
    </RequirePermission>
  );
}
