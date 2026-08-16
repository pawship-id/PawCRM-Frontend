import type { Metadata } from "next";

import { PayablesScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Faktur Pembelian · Buloo" };

/**
 * The nav already hides this entry from a role without `purchaseInvoices:read`;
 * the guard covers direct URL entry, which the nav cannot. What a tenant owes and
 * to whom is among the most commercially sensitive material in the system, so an
 * unguarded route here is worse than most.
 */
export default function PayablesPage() {
  return (
    <RequirePermission feature="purchaseInvoices" action="read">
      <PayablesScreen />
    </RequirePermission>
  );
}
