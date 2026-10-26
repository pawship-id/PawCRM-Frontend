import type { Metadata } from "next";

import { SystemSettingsScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Pengguna & Sistem · Pengaturan · Buloo",
};

/** UNGATED, like Umum: every card gates itself. Data Awal is ungated by design. */
export default function SystemSettingsPage() {
  return <SystemSettingsScreen />;
}
