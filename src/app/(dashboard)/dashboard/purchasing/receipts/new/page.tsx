import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  ReceiptForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Terima barang · Buloo" };

/**
 * `searchParams` is a Promise in this version of Next, like `params`. The
 * supplier can be pre-selected when arriving from a supplier's detail page.
 *
 * Gated on `create` rather than `read`: this screen posts an irreversible
 * document, and `/goods-receipts/preview` — which the form calls on every edit —
 * is itself gated on `create`, so a read-only role would meet a 403 on the first
 * keystroke rather than on the save.
 */
export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;

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

        <ReceiptForm supplierId={supplier} />
      </div>
    </RequirePermission>
  );
}
