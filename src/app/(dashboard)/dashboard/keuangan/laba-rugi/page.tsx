import type { Metadata } from "next";

import { ProfitLossScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Laba Rugi · Buloo" };

/**
 * Rendered per request, for the same reason the Keuangan hub is: the date
 * presets are dates, and a client component that read the clock while rendering
 * would disagree with the HTML the server sent. Prerendering would freeze them
 * at build time instead, which is worse than either.
 */
export const dynamic = "force-dynamic";

/**
 * GATED ON `journalEntries`, not on a permission of its own. The report is the
 * general ledger folded — anybody who may read the ledger may read its total,
 * and anybody who may not could reconstruct one from the entries anyway.
 */
export default function LabaRugiPage() {
  return (
    <RequirePermission feature="journalEntries">
      <ProfitLossScreen now={new Date().toISOString()} />
    </RequirePermission>
  );
}
