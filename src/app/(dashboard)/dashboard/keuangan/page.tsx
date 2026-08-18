import type { Metadata } from "next";

import { FinanceDashboardScreen } from "@/features/accounting";

export const metadata: Metadata = { title: "Keuangan · Buloo" };

/**
 * Rendered per request, not at build time.
 *
 * The screen opens on "Semua" and computes no default period, but its date
 * presets — Hari ini, 7 hari, Bulan lalu — are still dates that have to be
 * decided somewhere. A client component that read the clock while rendering
 * would disagree with the HTML the server sent, so the moment is computed here
 * and passed down. Prerendering this page would then freeze it at build time,
 * which is the one thing worse than either.
 */
export const dynamic = "force-dynamic";

export default function KeuanganPage() {
  return <FinanceDashboardScreen now={new Date().toISOString()} />;
}
