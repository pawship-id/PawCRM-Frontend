import type { Metadata } from "next";

import { CashTransactionEditScreen } from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah transaksi · Buloo" };

/**
 * UBAH — a page since 20 September 2026, on request; it used to be a dialog off
 * the detail. `params` is a Promise in this version of Next — see AGENTS.md.
 */
export default async function EditCashTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="cashTransactions" action="update">
      <CashTransactionEditScreen transactionId={id} />
    </RequirePermission>
  );
}
