import type { Metadata } from "next";

import {
  KasBankScreen,
  type KasBankSection,
} from "@/features/payment-channels";
import { cashTransactionsQueryFromParams } from "@/features/cash-transactions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Kas & Bank · Keuangan · Buloo",
};

/**
 * Rendered per request, not at build time — the period presets are dates, and
 * prerendering would freeze them at build time. Same reason as the Ringkasan
 * tab; see its page.
 */
export const dynamic = "force-dynamic";

/**
 * `?kind=` / `?direction=` / `?status=` / `?documentId=` are read HERE, as the
 * payables form reads `?receipt=`: the server already has them, so the screen
 * needs no `useSearchParams` and no Suspense boundary. `searchParams` is a
 * Promise in this version of Next — see AGENTS.md.
 *
 * KEYED ON THE QUERY, so following a deep link while already on this route
 * (the komisi screen's "Riwayat pembayaran komisi") starts from the new filter
 * instead of keeping the old state.
 *
 * EITHER GRANT OPENS IT. The page is two halves — the channel table needs
 * `paymentChannels:read`, the cards and the list need `cashTransactions:read` —
 * and each is gated again inside, so a reader with one and not the other gets
 * the half they may see rather than an access-denied panel.
 */
export default async function KasBankPage({
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
    <RequirePermission
      anyOf={[
        { feature: "paymentChannels" },
        { feature: "cashTransactions" },
      ]}
    >
      <KasBankScreen
        key={JSON.stringify(initialQuery)}
        now={new Date().toISOString()}
        initialQuery={initialQuery}
      />
    </RequirePermission>
  );
}

/** Exported for the sibling route below it, which renders the same screen. */
export type { KasBankSection };
