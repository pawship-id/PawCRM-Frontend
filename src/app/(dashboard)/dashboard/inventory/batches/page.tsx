import type { Metadata } from "next";

import { BatchesScreen, StockModuleHeader } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Batch & Expired · Stok · Buloo",
};

/**
 * The Batch & Expired tab of the Stok module.
 *
 * THE HEADER SITS OUTSIDE THE PERMISSION GATE, deliberately: a reader who may
 * not read lots still gets the module's title and its tab row, so the refusal
 * below reads as "not this tab" rather than as a broken page. The header draws
 * no Batch & Expired tab for them either — it gates each tab itself.
 *
 * THE OLD SUBTITLE IS GONE — it said the list was "diurutkan dari yang paling
 * dekat kedaluwarsa", which the toolbar's Urutkan field has been able to change
 * for a while now. A heading that states a sort somebody can turn off is a
 * heading that starts lying on the second click.
 */
export default function BatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <StockModuleHeader />

      {/* The nav already hides this module from a role without the grant; this
          covers direct URL entry. */}
      <RequirePermission feature="productBatches">
        <BatchesScreen />
      </RequirePermission>
    </div>
  );
}
