import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ACCOUNTING_CRUMBS } from "@/features/accounting";
import { CashImportScreen } from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Impor transaksi · Buloo" };

/** Upload Kas & Bank. Gated on `cashTransactions:create`, the commit's own. */
export default function CashImportPage() {
  return (
    <RequirePermission feature="cashTransactions" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.cashBank,
              { label: "Transaksi", href: ACCOUNTING_CRUMBS.cashBank.href },
              { label: "Impor" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Impor transaksi
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Catat banyak pembayaran dan penerimaan sekaligus dari satu file,
            termasuk transfer antar rekening.
          </p>
        </div>

        <CashImportScreen />
      </div>
    </RequirePermission>
  );
}
