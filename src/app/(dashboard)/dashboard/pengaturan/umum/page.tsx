import type { Metadata } from "next";

import { GeneralSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Umum · Pengaturan · Buloo" };

/**
 * UNGATED, like the two other hubs in this app (Inventori and Pembelian): every
 * card gates itself on the grant its own destination enforces, so the page is
 * already exactly as much as the role may read. A single `RequirePermission`
 * here would have to pick one of four features and would refuse somebody who may
 * legitimately read three of them.
 */
export default function GeneralSettingsPage() {
  return <GeneralSettingsScreen />;
}
