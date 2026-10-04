import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { NumberingSettingsScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Nomor Dokumen · Pengaturan · Buloo",
};

/**
 * Gated on `tenants:read`, the grant `GET /tenants/me/numbering` enforces.
 * Saving needs `tenants:update`, which the form asks for on its own — a reader
 * without it sees the shapes rather than a refusal.
 */
export default function NumberingSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <NumberingSettingsScreen />
    </RequirePermission>
  );
}
