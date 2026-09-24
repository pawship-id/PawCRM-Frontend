import type { Metadata } from "next";

import { FinanceSettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Keuangan · Pengaturan · Buloo" };

/**
 * UNGATED, like Umum: every card gates itself on the grant its own destination
 * enforces, and the tab is only drawn for a role holding at least one of them.
 */
export default function FinanceSettingsPage() {
  return <FinanceSettingsScreen />;
}
