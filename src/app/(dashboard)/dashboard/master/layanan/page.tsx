import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { ServiceSettingsScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Layanan · Pengaturan · Buloo",
};

/**
 * Pengaturan › Layanan — a hub of cards, from the mockup. The catalogue that used
 * to be this page is at `/katalog`, one card away.
 *
 * GATED, unlike Umum and Data Awal: every card that leads anywhere leads to the
 * catalogue, so `services:read` describes the whole page — and it is the grant
 * the rail row already asks for.
 */
export default function ServiceSettingsPage() {
  return (
    <RequirePermission feature="services">
      <ServiceSettingsScreen />
    </RequirePermission>
  );
}
