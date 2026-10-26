import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { SalesSummaryScreen } from "@/features/sales";
import { SALES_TABS } from "@/features/sales/components/SalesModuleHeader";

export const metadata: Metadata = {
  title: "Ringkasan · Penjualan · Buloo",
};

/**
 * The Ringkasan tab — where the period's omzet came from, and THE MODULE'S
 * LANDING PAGE since 29 September 2026 (on request).
 *
 * IT TOOK OVER `/dashboard/sales` (moved on to `/dashboard/sales/summary` on 26
 * October 2026, the bare address forwarding here), which used to be the invoice list; that list
 * now lives at `/dashboard/sales/invoice` with its detail, print and payment
 * screens under it. The rail's Penjualan row therefore opens here, which is what
 * the move was for: the question somebody has on opening a sales module is what
 * the month looked like, not which bill is third from the top.
 *
 * GATED ON `customerInvoices:read`, like the Faktur list it summarises and
 * unlike the two placeholder tabs beside it: the figure on it is the tenant's
 * turnover, read from the same endpoint the list's cards use. The nav hides the
 * whole module from a role without the grant; this guard covers direct URL
 * entry, which the nav cannot.
 */
export default function SalesSummaryPage() {
  return (
    <RequirePermission feature="salesSummary" redirectTo={SALES_TABS}>
      <SalesSummaryScreen />
    </RequirePermission>
  );
}
