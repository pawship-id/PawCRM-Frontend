import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import {
  ServiceSettingsScreen,
  serviceSettingsSectionOf,
} from "@/features/settings";

export const metadata: Metadata = {
  title: "Layanan · Pengaturan · Buloo",
};

/**
 * Pengaturan › Layanan — one page with a rail (Opsi Varian, Ras, Tahapan,
 * Add-on, Zona), from mockup `buloo-pengaturan-v3`. `?bagian=` opens a section;
 * anything unknown opens the first.
 *
 * GATED on `services:read`: every section is either the service catalogue or
 * the vocabulary its services are priced by, and it is the grant the rail row
 * in the sidebar already asks for. Writes are gated per action inside.
 */
export default async function ServiceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bagian } = await searchParams;

  return (
    <RequirePermission feature="services">
      <ServiceSettingsScreen initialSection={serviceSettingsSectionOf(bagian)} />
    </RequirePermission>
  );
}
