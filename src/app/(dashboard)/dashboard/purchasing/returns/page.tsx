import type { Metadata } from "next";

import { PurchaseReturnsScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Retur ke Supplier · Buloo" };

/**
 * The heading, the toolbar and the create button all live inside the screen —
 * matching the receipts page. They depend on the list's own state (the search
 * term, the permission to create), and a page that rendered its own copy would
 * be a second place for the wording to drift.
 */
export default function PurchaseReturnsPage() {
  return (
    <RequirePermission feature="purchaseReturns" action="read">
      <PurchaseReturnsScreen />
    </RequirePermission>
  );
}
