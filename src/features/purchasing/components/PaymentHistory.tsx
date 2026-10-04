"use client";

import Link from "next/link";

import { Card, JournalLink } from "@/components";
import { Badge } from "@/components/ui/badge";
import { cashTransactionHref } from "@/features/cash-transactions";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { PurchaseInvoicePayment } from "@/types/api";

const METHOD_LABEL: Record<PurchaseInvoicePayment["method"], string> = {
  transfer: "transfer",
  cash: "tunai",
  qris: "QRIS",
  giro: "giro",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every payment made against one invoice, newest last.
 *
 * IN THE ORDER THEY WERE MADE, deliberately — this is a running account of how a
 * bill was settled, and instalments read as a sequence.
 *
 * EACH ROW IS A CASH TRANSACTION NOW (`paymentId` is its id), with its own BBK/
 * BKK number, and THAT is where a wrong one is fixed: Transaksi Keuangan can
 * change it (the number stays, the journal is reversed and posted again) or
 * cancel it, and either way the invoice's paid amount follows. The row links
 * there for whoever may read it; nothing here edits a payment in place.
 *
 * A CANCELLED PAYMENT STAYS, struck through and marked — it posted an entry and
 * a reversal, and a history that dropped it would leave both pointing at
 * nothing a reader can find.
 */
export function PaymentHistory({
  payments,
}: {
  payments: PurchaseInvoicePayment[];
}) {
  const { can } = usePermissions();
  const mayReadTransactions = can("cashTransactions", "read");
  const mayReadLedger = can("journalEntries", "read");

  return (
    <Card title="Riwayat pembayaran">
      {payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Belum ada pembayaran untuk faktur ini.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((payment) => {
            const voided = payment.isVoided ?? Boolean(payment.voidedAt);

            return (
              <li
                key={payment.paymentId}
                className={cn(
                  "flex flex-col gap-1 border-l-2 pl-3",
                  voided ? "border-border" : "border-primary",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {payment.paymentNumber && (
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      {payment.paymentNumber}
                    </span>
                  )}
                  <b
                    className={cn(
                      "tabular-nums",
                      voided && "text-muted line-through",
                    )}
                  >
                    {formatMoney(payment.amount)}
                  </b>
                  <Badge variant="outline">{METHOD_LABEL[payment.method]}</Badge>
                  {voided && (
                    <span className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
                      dibatalkan
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    <span className="tabular-nums">{formatDate(payment.at)}</span>
                    {payment.ref && ` · ${payment.ref}`}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {payment.byUserName ?? "Pengguna terhapus"} · jurnal{" "}
                  <JournalLink
                    id={payment.journalEntryId}
                    number={null}
                    linked={mayReadLedger}
                  />
                </p>
                {mayReadTransactions && (
                  <Link
                    href={cashTransactionHref(payment.paymentId)}
                    className="w-fit rounded-md text-sm font-semibold text-primary underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Buka di Transaksi Keuangan →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {payments.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Pembayaran tidak dihapus. Yang salah diubah atau dibatalkan dari{" "}
          <b>Transaksi Keuangan</b> — nomornya tetap, jurnalnya dibalik, dan
          angka <i>dibayar</i> pada faktur ini ikut menyesuaikan.
        </p>
      )}
    </Card>
  );
}
