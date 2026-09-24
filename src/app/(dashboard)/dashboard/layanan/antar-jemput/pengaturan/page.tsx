import type { Metadata } from "next";

import { AntarJemputSettingsScreen } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pengaturan · Antar-Jemput · Buloo",
};

/** Commission lives on the tenant, so reading it is `tenants:read`, as Grooming's. */
export default function AntarJemputSettingsPage() {
  return (
    <RequirePermission feature="tenants">
      <AntarJemputSettingsScreen />
    </RequirePermission>
  );
}
