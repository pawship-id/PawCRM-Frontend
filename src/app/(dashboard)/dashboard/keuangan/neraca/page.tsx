import type { Metadata } from "next";

import { BalanceSheetScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Neraca · Buloo" };

/**
 * Rendered per request, like the other two reports: the date presets are dates,
 * and a client component that read the clock while rendering would disagree with
 * the HTML the server sent.
 */
export const dynamic = "force-dynamic";

/**
 * GATED ON `journalEntries`, like Laba Rugi and Arus Kas. A neraca is the ledger
 * folded — anybody who may read the entries may add them up, and anybody who may
 * not could reconstruct one from the list anyway.
 */
export default function NeracaPage() {
  return (
    <RequirePermission feature="journalEntries">
      <BalanceSheetScreen now={new Date().toISOString()} />
    </RequirePermission>
  );
}
