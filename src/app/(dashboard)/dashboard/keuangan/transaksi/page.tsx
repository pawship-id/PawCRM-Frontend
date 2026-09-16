import { permanentRedirect } from "next/navigation";

/**
 * Transaksi moved under Kas & Bank on 16 September 2026 — it is that page's
 * first sub-tab now, beneath the cards and the channel table that say where the
 * money sits.
 *
 * A REDIRECT RATHER THAN A DELETED ROUTE, and it keeps its QUERY: other screens
 * deep-link here (`?kind=commission_payment` from the komisi recap,
 * `?documentId=` from a faktur), and those links are in people's notes and
 * browser histories. `permanentRedirect` because the move is permanent — a 308
 * lets a browser stop asking.
 */
export default async function LegacyCashTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== undefined) params.append(key, entry);
    }
  }

  const query = params.toString();
  permanentRedirect(`/dashboard/keuangan/kas-bank${query ? `?${query}` : ""}`);
}
