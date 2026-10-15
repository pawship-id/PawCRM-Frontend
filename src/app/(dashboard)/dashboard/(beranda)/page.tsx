import type { Metadata } from "next";

import { BERANDA_TABS, BerandaHariIni } from "@/features/dashboard";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Beranda · Buloo" };

/**
 * Beranda › Hari Ini — from `buloo-navigation-v3`. A role without its "Lihat"
 * is sent to the first Beranda tab it may open.
 */
export default function BerandaPage() {
  return (
    <RequirePermission feature="berandaToday" redirectTo={BERANDA_TABS}>
      <BerandaHariIni />
    </RequirePermission>
  );
}
