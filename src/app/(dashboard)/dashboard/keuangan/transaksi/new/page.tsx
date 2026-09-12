import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ACCOUNTING_CRUMBS } from "@/features/accounting";
import { CashTransactionCreateForm } from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Catat transaksi · Buloo" };

export default function NewCashTransactionPage() {
  return (
    <RequirePermission feature="cashTransactions" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.transactions,
              { label: "Catat transaksi" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Catat transaksi
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Untuk uang yang tidak punya faktur di belakangnya — sewa, listrik,
            gaji, atau pemasukan di luar penjualan. Pembayaran faktur dan komisi
            dicatat dari layarnya masing-masing.
          </p>
        </div>

        <CashTransactionCreateForm />
      </div>
    </RequirePermission>
  );
}
