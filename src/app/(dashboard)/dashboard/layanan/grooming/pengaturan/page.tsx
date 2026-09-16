import type { Metadata } from "next";

import { GroomingSettingsScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pengaturan · Grooming · Buloo",
};

/**
 * The Pengaturan tab — commission and capacity live on the tenant, so reading
 * it is `tenants:read`. Saving asks for more; the screen handles that.
 */
export default function GroomingSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <GroomingSettingsScreen />
    </RequirePermission>
  );
}
