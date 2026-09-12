import { formatMoney } from "@/utils/decimal";
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

/**
 * WHAT NAMES ONE PAYMENT — its number where it has one.
 *
 * `PMT-2026-0001` IS THE LABEL, `paymentId` IS THE KEY. The number is what a
 * shop reads back to a customer or writes on a reconciliation sheet; nothing on
 * screen shows the id.
 *
 * FALLS BACK TO THE AMOUNT for a payment recorded before the series existed —
 * every one of them has `paymentNumber: null`, and a blank heading is worse
 * than one that still names the payment by what it moved.
 */
export function paymentTitle(payment: CustomerInvoicePayment): string {
  return payment.paymentNumber ?? formatMoney(payment.amount);
}
