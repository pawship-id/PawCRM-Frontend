import type { Metadata } from "next";

import { JournalEntriesScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Jurnal · Keuangan · Buloo" };

// The period pills are dates, so the clock is the server's — see KasBankPage.
export const dynamic = "force-dynamic";

export default function JournalEntriesPage() {
  return (
    <RequirePermission feature="journalEntries">
      <JournalEntriesScreen now={new Date().toISOString()} />
    </RequirePermission>
  );
}
