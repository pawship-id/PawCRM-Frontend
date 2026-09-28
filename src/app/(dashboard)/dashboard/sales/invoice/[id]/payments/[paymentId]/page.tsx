import type { Metadata } from "next";

import { InvoicePaymentDetail } from "@/features/sales";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail Pembayaran · Buloo" };

/**
 * One payment against one invoice — reached from the invoice's Riwayat
 * pembayaran.
 *
 * `params` IS A PROMISE in this version of Next — see AGENTS.md.
 *
 * GATED ON `read`, like the invoice itself: the page shows nothing the invoice
 * does not already carry. Its one action that moves money — cancelling — sits
 * behind its own `void` gate inside.
 */
export default async function SalesInvoicePaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;

  return (
    <RequirePermission feature="customerInvoices" action="read">
      <InvoicePaymentDetail invoiceId={id} paymentId={paymentId} />
    </RequirePermission>
  );
}
