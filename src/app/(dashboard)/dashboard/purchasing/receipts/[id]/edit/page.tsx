import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  ReceiptForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Update penerimaan · Buloo" };

/**
 * The receipt form on an existing receipt: the lines are fixed, and only what
 * has arrived changes (15 October 2026, BO — the checklist lives on the form;
 * the separate receiving page is gone). Gated by `goodsReceipts:create`, the
 * grant the receive endpoint checks.
 */
export default async function EditReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="goodsReceipts" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.receipts,
            {
              label: "Detail penerimaan",
              href: `/dashboard/purchasing/receipts/${id}`,
            },
            { label: "Update penerimaan" },
          ]}
          title="Update penerimaan"
        >
          Centang barang yang sudah datang lengkap, atau ubah jumlahnya. Stok,
          HPP, dan utang hanya bergerak sebesar perubahannya.
        </PageHeading>

        <ReceiptForm receiptId={id} />
      </div>
    </RequirePermission>
  );
}
