import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { IdentitySettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Identitas · Pengaturan · Buloo" };

/**
 * Gated on `tenants:read`, the grant GET /api/tenants/me enforces. Saving needs
 * `tenants:update`, which the form asks for on its own — a reader without it
 * sees the values rather than a refusal.
 */
export default function IdentitySettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <IdentitySettingsScreen />
    </RequirePermission>
  );
}
