import type { Metadata } from "next";

import { CashTransactionDetail } from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail transaksi · Buloo" };

/**
 * One transaction. Gated on `read`; Ubah and Batalkan sit behind their own
 * `update` / `void` grants inside. `params` is a Promise in this Next.
 */
export default async function CashTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="cashTransactions">
      <CashTransactionDetail transactionId={id} />
    </RequirePermission>
  );
}
