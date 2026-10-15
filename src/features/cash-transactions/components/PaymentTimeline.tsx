import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** What one row needs — both invoice payment shapes satisfy it. */
export interface TimelinePayment {
  paymentId: string;
  paymentNumber?: string | null;
  amount: string;
  at: string;
  isVoided?: boolean;
}

/**
 * RIWAYAT PEMBAYARAN — a short timeline beside the balance, each row opening
 * that payment's own page. ONE CARD FOR BOTH SIDES (15 October 2026, on
 * request): a sales invoice's and a supplier invoice's read the same.
 *
 * In the order the payments arrived — a running account of how a debt was
 * settled reads as a sequence. A CANCELLED PAYMENT STAYS, struck through: it
 * posted an immutable entry, and dropping it would leave that entry pointing at
 * nothing a reader can find.
 */
export function PaymentTimeline<P extends TimelinePayment>({
  payments,
  hrefFor,
  labelFor,
}: {
  payments: P[];
  /** Where a row opens — the payment's own page; null for a plain row. */
  hrefFor: (payment: P) => string | null;
  /** How the money moved: "Transfer — BCA", "Bank BCA". */
  labelFor: (payment: P) => string;
}) {
  return (
    <Card title="Riwayat pembayaran">
      {payments.length === 0 ? (
        <p className="text-sm text-muted">Belum ada pembayaran tercatat.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {payments.map((payment) => {
            const href = hrefFor(payment);
            const body = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    payment.isVoided ? "bg-muted" : "bg-success-fill",
                  )}
                />
                <span className="min-w-0 flex-1">
                  {/* The payment's own number, where it has one — null on a
                      payment recorded before the series existed. */}
                  {payment.paymentNumber && (
                    <span className="block text-xs font-semibold text-primary tabular-nums">
                      {payment.paymentNumber}
                    </span>
                  )}
                  <span
                    className={cn(
                      "block text-sm font-semibold tabular-nums",
                      payment.isVoided && "text-muted line-through",
                    )}
                  >
                    {formatMoney(payment.amount)}
                  </span>
                  <span className="block text-xs text-muted">
                    <span className="tabular-nums">
                      {formatDate(payment.at)}
                    </span>{" "}
                    · {labelFor(payment)}
                  </span>
                </span>
                {payment.isVoided && (
                  <span className="shrink-0 rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
                    dibatalkan
                  </span>
                )}
                {href && (
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted"
                  />
                )}
              </>
            );

            return (
              <li
                key={payment.paymentId}
                className="border-b border-border last:border-b-0"
              >
                {href ? (
                  <Link
                    href={href}
                    className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-start gap-3 px-2 py-2.5">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
