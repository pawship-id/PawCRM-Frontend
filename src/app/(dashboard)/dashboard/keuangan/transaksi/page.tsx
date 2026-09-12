import type { Metadata } from "next";

import {
  CashTransactionsScreen,
  cashTransactionsQueryFromParams,
} from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Transaksi · Buloo" };

/**
 * `?kind=` / `?direction=` / `?status=` / `?documentId=` are read HERE, as the
 * payables form reads `?receipt=`: the server already has them, so the screen
 * needs no `useSearchParams` and no Suspense boundary. `searchParams` is a
 * Promise in this version of Next — see AGENTS.md.
 *
 * KEYED ON THE QUERY, so following a deep link while already on this route
 * (the komisi screen's "Riwayat pembayaran komisi") starts from the new filter
 * instead of keeping the old state.
 */
export default async function CashTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string | string[];
    direction?: string | string[];
    status?: string | string[];
    documentId?: string | string[];
  }>;
}) {
  const initialQuery = cashTransactionsQueryFromParams(await searchParams);

  return (
    <RequirePermission feature="cashTransactions">
      <CashTransactionsScreen
        key={JSON.stringify(initialQuery)}
        initialQuery={initialQuery}
      />
    </RequirePermission>
  );
}
