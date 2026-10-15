import { PaymentTimeline } from "@/features/cash-transactions/components/PaymentTimeline";
import type { CustomerInvoicePayment } from "@/types/api";

import { paymentChannelLabel } from "../paymentLabels";

/**
 * RIWAYAT PEMBAYARAN of a receivable — the shared timeline (moved to
 * cash-transactions on 15 October 2026 when Pembelian adopted it). Each row
 * opens the payment's own page, where Kwitansi and Batalkan live.
 */
export function InvoicePaymentTimeline({
  invoiceId,
  payments,
}: {
  invoiceId: string;
  payments: CustomerInvoicePayment[];
}) {
  return (
    <PaymentTimeline
      payments={payments}
      hrefFor={(payment) =>
        `/dashboard/sales/invoice/${invoiceId}/payments/${payment.paymentId}`
      }
      labelFor={paymentChannelLabel}
    />
  );
}
