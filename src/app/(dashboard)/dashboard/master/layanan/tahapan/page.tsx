import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { ServiceStepsScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Tahapan · Pengaturan · Buloo",
};

/**
 * Pengaturan › Layanan › Tahapan — the steps each business line's services
 * pick from: Mandi, Gunting, Blow dry.
 *
 * GATED ON `services:read`, and here that grant IS the data's. GET
 * /api/service-steps asks for it (unlike the pet vocabulary next door), and it
 * is also the hub's gate — the page is reached from Pengaturan › Layanan, which
 * the rail row and that page both check the same way.
 *
 * WRITING IS `services:update` / `delete` / `restore`, checked per action
 * inside the screen. There is no `serviceSteps` feature: a tahapan is part of
 * what a service is, so whoever may edit services edits the list (14 September
 * 2026).
 */
export default function ServiceStepsPage() {
  return (
    <RequirePermission feature="services">
      <ServiceStepsScreen />
    </RequirePermission>
  );
}
