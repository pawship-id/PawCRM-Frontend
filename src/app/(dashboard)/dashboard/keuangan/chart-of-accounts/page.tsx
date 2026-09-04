import type { Metadata } from "next";

import { ChartOfAccountsScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Daftar Akun · Buloo" };

export default function ChartOfAccountsPage() {
  return (
    <RequirePermission feature="chartOfAccounts">
      <ChartOfAccountsScreen />
    </RequirePermission>
  );
}
