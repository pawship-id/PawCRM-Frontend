import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ACCOUNTING_CRUMBS, JournalEntryDetail } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail jurnal · PawShip" };

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="journalEntries">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.journal,
              { label: "Detail entri" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Detail entri jurnal
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Satu transaksi beserta baris debit dan kreditnya. Entri yang sudah
            diposting tidak bisa diubah — koreksi dilakukan dengan jurnal
            pembalik.
          </p>
        </div>

        <JournalEntryDetail entryId={id} />
      </div>
    </RequirePermission>
  );
}
