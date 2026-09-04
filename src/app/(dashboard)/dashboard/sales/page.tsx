import type { Metadata } from "next";

import { ReceivablesScreen } from "@/features/sales";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Faktur Penjualan · Buloo" };

/**
 * The nav hides this entry from a role without `customerInvoices:read`; the
 * guard covers direct URL entry, which the nav cannot.
 *
 * Who owes a shop money, and how much, is among the most commercially sensitive
 * material in the system — an unguarded route here is worse than most.
 */
export default function SalesPage() {
  return (
    <RequirePermission feature="customerInvoices" action="read">
      <ReceivablesScreen />
    </RequirePermission>
  );
}
