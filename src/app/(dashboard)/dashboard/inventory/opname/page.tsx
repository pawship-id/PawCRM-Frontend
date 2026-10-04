import type { Metadata } from "next";

import {
  OpnameScreen,
  StockCorrectionModuleHeader,
} from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Opname · Koreksi Stok · Buloo" };

/**
 * The Opname tab of the Koreksi Stok module.
 *
 * THE HEADER SITS OUTSIDE THE PERMISSION GATE, and deliberately: a reader who
 * may not read count sheets still gets the module's title and its tab row, so
 * the refusal below reads as "not this tab" rather than as a broken page. The
 * header draws no Opname tab for them either — it gates each tab itself.
 */
export default function OpnamePage() {
  return (
    <div className="flex flex-col gap-6">
      <StockCorrectionModuleHeader />

      {/* The nav already hides this module from a role without the grant; this
          covers direct URL entry. Opening a count and discarding a draft carry
          their own checks inside — reading the list is a different privilege. */}
      <RequirePermission feature="stockOpnames">
        <OpnameScreen />
      </RequirePermission>
    </div>
  );
}
