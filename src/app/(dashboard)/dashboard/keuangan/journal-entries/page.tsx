import type { Metadata } from "next";

import { JournalEntriesScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Jurnal Umum · PawShip" };

export default function JournalEntriesPage() {
  return (
    <RequirePermission feature="journalEntries">
      <JournalEntriesScreen />
    </RequirePermission>
  );
}
