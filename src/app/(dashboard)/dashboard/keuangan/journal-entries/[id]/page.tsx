import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ACCOUNTING_CRUMBS, JournalEntryDetail } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail jurnal · Buloo" };

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="journalEntries">
      <div className="flex flex-col gap-4">
        <Breadcrumb
          items={[
            ACCOUNTING_CRUMBS.hub,
            ACCOUNTING_CRUMBS.journal,
            { label: "Detail jurnal" },
          ]}
        />

        <JournalEntryDetail entryId={id} />
      </div>
    </RequirePermission>
  );
}
