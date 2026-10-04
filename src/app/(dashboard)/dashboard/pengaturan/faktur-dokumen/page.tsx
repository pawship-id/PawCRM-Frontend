import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { DocumentSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Faktur & Dokumen · Pengaturan · Buloo" };

/** Gated on `tenants:read`, the grant GET /api/tenants/me enforces. */
export default function DocumentSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <DocumentSettingsScreen />
    </RequirePermission>
  );
}
