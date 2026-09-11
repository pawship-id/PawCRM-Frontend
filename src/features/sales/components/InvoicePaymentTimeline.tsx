import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoicePayment } from "@/types/api";

import { paymentChannelLabel } from "../paymentLabels";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * RIWAYAT PEMBAYARAN, as the mockup draws it: a short timeline beside the
 * balance, each row opening that payment's own page.
 *
 * THE ACTIONS MOVED TO THE PAYMENT'S PAGE. Every row used to carry Kwitansi and
 * Batalkan buttons, which is a lot of machinery in a 340-pixel column read
 * mostly to answer "has anything come in". Printing a receipt and cancelling a
 * payment are acts about ONE payment, and they now live where that payment is
 * the subject — one click further, and in front of its journal entry.
 *
 * IN THE ORDER THEY ARRIVED, deliberately — a running account of how a debt was
 * settled reads as a sequence.
 *
 * A CANCELLED PAYMENT STAYS, struck through and greyed. It posted an immutable
 * entry, and a timeline that quietly dropped it would leave that entry pointing
 * at nothing a reader can find. The rows that are not struck through are the
 * ones `paidAmount` counts.
 */
export function InvoicePaymentTimeline({
  invoiceId,
  payments,
}: {
  invoiceId: string;
  payments: CustomerInvoicePayment[];
}) {
  return (
    <Card title="Riwayat pembayaran">
      {payments.length === 0 ? (
        <p className="text-sm text-muted">Belum ada pembayaran tercatat.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {payments.map((payment) => (
            <li
              key={payment.paymentId}
              className="border-b border-border last:border-b-0"
            >
              <Link
                href={`/dashboard/sales/${invoiceId}/payments/${payment.paymentId}`}
                className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    payment.isVoided ? "bg-muted" : "bg-success-fill",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-semibold tabular-nums",
                      payment.isVoided && "text-muted line-through",
                    )}
                  >
                    {formatMoney(payment.amount)}
                  </span>
                  <span className="block text-xs text-muted">
                    <span className="tabular-nums">{formatDate(payment.at)}</span>{" "}
                    · {paymentChannelLabel(payment)}
                  </span>
                </span>
                {payment.isVoided && (
                  <span className="shrink-0 rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
                    dibatalkan
                  </span>
                )}
                <ChevronRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
