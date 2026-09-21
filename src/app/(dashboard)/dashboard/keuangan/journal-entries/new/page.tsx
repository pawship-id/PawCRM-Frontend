import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import {
  ACCOUNTING_CRUMBS,
  JournalEntryCreateForm,
} from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Tambah jurnal manual · Buloo" };

export default function NewJournalEntryPage() {
  return (
    <RequirePermission feature="journalEntries" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.journal,
              { label: "Tambah jurnal manual" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Tambah jurnal manual
          </h1>
        </div>

        <JournalEntryCreateForm />
      </div>
    </RequirePermission>
  );
}
