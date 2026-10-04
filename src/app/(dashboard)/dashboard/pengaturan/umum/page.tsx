import type { Metadata } from "next";

import { GeneralSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Umum · Pengaturan · Buloo" };

/**
 * The tenant's profile and the first tab of Pengaturan.
 *
 * UNGATED, like the two other hubs in this app (Inventori and Pembelian): each
 * section gates itself on the grant it reads — the profile on `tenants:read`,
 * the branch list on `branches:read` — so the page is already exactly as much as
 * the role may read. A single `RequirePermission` here would refuse somebody who
 * may legitimately read half of it.
 */
export default function GeneralSettingsPage() {
  return <GeneralSettingsScreen />;
}
