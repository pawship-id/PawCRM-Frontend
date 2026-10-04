import type { Metadata } from "next";

import {
  StockCorrectionModuleHeader,
  StockEntriesScreen,
} from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Penyesuaian · Koreksi Stok · Buloo",
};

/**
 * The Penyesuaian tab of the Koreksi Stok module.
 *
 * THE LIST COMES FIRST, and the form is behind a button. This route used to open
 * straight onto the form, which meant a correction could be made and then never
 * found again — the movements landed in the stock card one product at a time,
 * with nothing saying how many corrections a shop had made or why. Every other
 * document in this system opens on its list.
 *
 * GATED ON `read`, not on `create`: the list is paperwork over the ledger, and
 * somebody who may page the stock card may read what explains its rows. The
 * write is gated separately, on the button and on the /new route.
 *
 * WHAT THE SENTENCE UNDER THE OLD TITLE SAID — that an adjustment posts to
 * kerugian persediaan and carries its own document number — is not lost with the
 * heading: it is what the empty state and the form both say, in the place where
 * somebody is about to act on it.
 */
export default function StockAdjustmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <StockCorrectionModuleHeader />

      <RequirePermission feature="stockMovements" action="read">
        <StockEntriesScreen kind="adjustment" />
      </RequirePermission>
    </div>
  );
}
