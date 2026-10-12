import type { Metadata } from "next";

import { StockTransferPrintScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Cetak surat jalan · Buloo" };

/**
 * Surat jalan for one transfer.
 *
 * Gated on `read`: the note shows exactly what the transfer's own detail shows,
 * and printing it is not a separate kind of access. `params` is a Promise in
 * this version of Next.
 */
export default async function PrintStockTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="stockMovements" action="read">
      <StockTransferPrintScreen transferId={id} />
    </RequirePermission>
  );
}
