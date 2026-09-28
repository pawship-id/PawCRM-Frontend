import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { SalesSummaryScreen } from "@/features/sales";

export const metadata: Metadata = {
  title: "Ringkasan · Penjualan · Buloo",
};

/**
 * The Ringkasan tab — where the period's omzet came from.
 *
 * GATED ON `customerInvoices:read`, like the Faktur list it summarises and
 * unlike the two placeholder tabs beside it: the figure on it is the tenant's
 * turnover, read from the same endpoint the list's cards use. The nav hides the
 * whole module from a role without the grant; this guard covers direct URL
 * entry, which the nav cannot.
 */
export default function SalesSummaryPage() {
  return (
    <RequirePermission feature="customerInvoices" action="read">
      <SalesSummaryScreen />
    </RequirePermission>
  );
}
