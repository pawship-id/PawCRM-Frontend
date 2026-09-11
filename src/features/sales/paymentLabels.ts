import type { CustomerInvoicePayment } from "@/types/api";

/**
 * How a customer paid, in the words a cashier uses.
 *
 * ONE MAP FOR EVERY SALES SCREEN that names a payment — the timeline on the
 * invoice, the payment's own page, the activity log. Three copies is how one
 * screen ends up saying "tunai" and another "cash" about the same money.
 */
export const PAYMENT_METHOD_LABEL: Record<CustomerInvoicePayment["method"], string> =
  {
    transfer: "Transfer",
    cash: "Tunai",
    qris: "QRIS",
    edc: "EDC",
  };

/** "Transfer — BCA Operasional", or the method alone when the channel is gone. */
export function paymentChannelLabel(payment: CustomerInvoicePayment): string {
  const method = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;
  return payment.channelName ? `${method} — ${payment.channelName}` : method;
}
