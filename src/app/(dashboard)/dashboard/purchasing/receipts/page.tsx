import type { Metadata } from "next";

import { ReceiptsScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";
import type { GoodsReceiptStatusFilter } from "@/types/api";

const KNOWN_STATUSES: GoodsReceiptStatusFilter[] = [
  "open",
  "pending",
  "partial",
  "received",
  "closed",
];

export const metadata: Metadata = { title: "Penerimaan Barang · Buloo" };

/**
 * `?status=open` opens the list already narrowed to deliveries still expected
 * (pending or partly received) — where the "Barang belum diterima" card leads.
 * Any other value outside the known statuses is ignored rather than trusted. `searchParams` is a Promise in this version of
 * Next, like `params`.
 */
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <RequirePermission feature="goodsReceipts" action="read">
      <ReceiptsScreen
        initialStatus={
          status && KNOWN_STATUSES.includes(status as GoodsReceiptStatusFilter)
            ? (status as GoodsReceiptStatusFilter)
            : undefined
        }
      />
    </RequirePermission>
  );
}
