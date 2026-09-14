import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { PetOptionsScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Data hewan · Pengaturan · Buloo",
};

/**
 * Pengaturan › Layanan › Data hewan — the tenant's species, breeds, sizes and
 * coats.
 *
 * GATED ON `services:read`, ALTHOUGH THE LISTS NEED NO GRANT TO READ. GET
 * /api/pet-options answers any session, because every screen that records an
 * animal reads it — so this gate is not about the data. It is the hub's: the
 * page is reached only from Pengaturan › Layanan, which the rail row and that
 * page both gate on `services:read`, and a child that opens by URL for somebody
 * its parent refuses is a page with no way in and no way back.
 *
 * WRITING IS `petOptions:*`, checked per action inside the screen. There is no
 * `petOptions:read` to put here instead, on purpose.
 */
export default function PetOptionsPage() {
  return (
    <RequirePermission feature="services">
      <PetOptionsScreen />
    </RequirePermission>
  );
}
