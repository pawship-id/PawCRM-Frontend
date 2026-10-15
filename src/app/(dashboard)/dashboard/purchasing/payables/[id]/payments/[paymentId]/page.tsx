import type { Metadata } from "next";

import { PurchasePaymentDetail } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail Pembayaran · Buloo" };

/**
 * One supplier payment — the purchasing twin of the sales invoice's payment
 * page. Reading it needs only `purchaseInvoices:read`; its Ubah / Batalkan
 * buttons check the Transaksi Keuangan grants they act through.
 */
export default async function PurchasePaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;

  return (
    <RequirePermission feature="purchaseInvoices" action="read">
      <PurchasePaymentDetail invoiceId={id} paymentId={paymentId} />
    </RequirePermission>
  );
}
