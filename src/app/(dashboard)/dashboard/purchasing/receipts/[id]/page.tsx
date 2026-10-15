import type { Metadata } from "next";

import { ReceiptDetail } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail penerimaan · Buloo" };

/**
 * One goods receipt. The heading is drawn by `ReceiptDetail` itself — its title
 * is the receipt NUMBER, which only the loaded document knows (15 October
 * 2026, matching the invoice pages).
 */
export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="goodsReceipts" action="read">
      <ReceiptDetail receiptId={id} />
    </RequirePermission>
  );
}
