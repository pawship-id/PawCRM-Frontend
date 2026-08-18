import type { Metadata } from "next";

import { CashflowScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Arus Kas · Buloo" };

/** Per request, like the other two report pages — see laba-rugi/page.tsx. */
export const dynamic = "force-dynamic";

/** Gated on `journalEntries`: cash movement is the ledger read another way. */
export default function ArusKasPage() {
  return (
    <RequirePermission feature="journalEntries">
      <CashflowScreen now={new Date().toISOString()} />
    </RequirePermission>
  );
}
