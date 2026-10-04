import type { Metadata } from "next";

import { ReceiptsScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Penerimaan Barang · Buloo" };

/**
 * `?status=pending` opens the list already narrowed to deliveries not yet
 * received — where the "Barang belum diterima" card leads. Anything else is
 * ignored rather than trusted. `searchParams` is a Promise in this version of
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
          status === "pending" || status === "received" ? status : undefined
        }
      />
    </RequirePermission>
  );
}
