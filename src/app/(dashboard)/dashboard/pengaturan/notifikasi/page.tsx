import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { NotificationSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Notifikasi · Pengaturan · Buloo" };

/** Gated on `tenants:read`, the grant GET /api/tenants/me enforces. */
export default function NotificationSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <NotificationSettingsScreen />
    </RequirePermission>
  );
}
