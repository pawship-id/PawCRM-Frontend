import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  ReceiptForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";
import type { PurchaseType } from "@/types/api";

export const metadata: Metadata = { title: "Terima barang · Buloo" };

/**
 * `searchParams` is a Promise in this version of Next, like `params`. The
 * supplier can be pre-selected when arriving from a supplier's detail page.
 *
 * `?type=` CARRIES THE TAB, so a refresh comes back to the one that was open.
 * Without it a reload mid-receipt drops silently to *Beli putus* — and the tab
 * decides which products the picker offers and whether the lines cost anything,
 * so the form would look the same and mean something else.
 *
 * Gated on `create` rather than `read`: this screen posts an irreversible
 * document, and `/goods-receipts/preview` — which the form calls on every edit —
 * is itself gated on `create`, so a read-only role would meet a 403 on the first
 * keystroke rather than on the save.
 */
export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; type?: string }>;
}) {
  const { supplier, type } = await searchParams;

  /**
   * VALIDATED AGAINST THE ONE VALUE THAT MATTERS, not cast.
   *
   * A query string is user input: `?type=bananas` must not become a
   * `PurchaseType` the form then branches on. Anything that is not exactly
   * `konsinyasi` — including absent, misspelt, or repeated (`string[]`) — is the
   * default, which is the safe side: *Beli putus* posts a journal the clerk can
   * see and correct, where a wrongly-defaulted consignment posts none at all.
   */
  const purchaseType: PurchaseType =
    type === "konsinyasi" ? "konsinyasi" : "beli_putus";

  return (
    <RequirePermission feature="goodsReceipts" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.receipts,
            { label: "Terima barang" },
          ]}
          title="Terima barang"
        >
          Penerimaan inilah yang membentuk HPP. Cocokkan harga beli dengan faktur
          supplier di tangan — angka yang keluar dipakai setiap penjualan
          berikutnya, dan tidak bisa diubah setelah disimpan.
        </PageHeading>

        <ReceiptForm supplierId={supplier} initialPurchaseType={purchaseType} />
      </div>
    </RequirePermission>
  );
}
