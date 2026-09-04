import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import {
  ACCOUNTING_CRUMBS,
  JournalEntryCreateForm,
} from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Jurnal baru · Buloo" };

export default function NewJournalEntryPage() {
  return (
    <RequirePermission feature="journalEntries" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.journal,
              { label: "Jurnal baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Jurnal baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Untuk koreksi yang tidak punya dokumen di belakangnya — memindahkan
            nilai dari akun yang salah ke akun yang benar. Penjualan, pembelian
            dan opname mencatat sendiri lewat menunya masing-masing, jadi
            keperluan itu tidak perlu diketik di sini.
          </p>
        </div>

        <JournalEntryCreateForm />
      </div>
    </RequirePermission>
  );
}
