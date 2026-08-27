"use client";

import Link from "next/link";
import { Printer, Undo2 } from "lucide-react";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoicePayment } from "@/types/api";

const METHOD_LABEL: Record<CustomerInvoicePayment["method"], string> = {
  transfer: "transfer",
  cash: "tunai",
  qris: "QRIS",
  edc: "EDC",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every payment received against one receivable, newest last.
 *
 * IN THE ORDER THEY ARRIVED, deliberately — this is a running account of how a
 * debt was settled, and instalments read as a sequence. Reversing it to
 * newest-first would put the final payment above the ones that led to it.
 *
 * A CANCELLED PAYMENT STAYS ON THE LIST, struck through and greyed, with its
 * reason. It is not hidden and it is not deleted: the row posted an immutable
 * ledger entry, and a timeline that quietly dropped it would leave that entry
 * pointing at nothing a reader can find. This is what the PRD means by
 * "pembayaran aktif" — the ones still counting are the ones not struck through,
 * and they are the ones `paidAmount` was computed from.
 *
 * EACH ROW NAMES THE ACCOUNT THE MONEY LANDED IN, which the payable's equivalent
 * does not. On this side that is the fact somebody reconciling a bank statement
 * is looking for: "Rp 500.000 masuk, transfer" is not enough to tick a line off
 * a mutasi when the shop has three rekening.
 *
 * TWO ACTIONS PER ROW, gated differently. Printing a kwitansi is something
 * anyone reading the invoice may do; cancelling one reverses a posted entry and
 * needs `customerInvoices:void`. A cancelled row keeps its print button — the
 * usual reason to re-print one is precisely that it was cancelled — and loses
 * its cancel button, because there is nothing left to undo.
 */
export function PaymentHistory({
  payments,
  onPrint,
  onVoid,
}: {
  payments: CustomerInvoicePayment[];
  onPrint: (payment: CustomerInvoicePayment) => void;
  onVoid: (payment: CustomerInvoicePayment) => void;
}) {
  /*
    THE LINK IS GATED, THE LABEL IS NOT. `journalEntries:read` is a separate
    grant, and a link that lands on "Akses ditolak" is worse than plain text —
    it promises somewhere to go. The number itself is still worth showing to
    everybody: it is what somebody quotes to whoever CAN open the ledger.
  */
  const { can } = usePermissions();
  const mayReadLedger = can("journalEntries", "read");

  return (
    <Card title="Riwayat pembayaran">
      {payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Belum ada pembayaran untuk faktur ini.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((payment) => (
            <li
              key={payment.paymentId}
              className={cn(
                "flex flex-wrap items-start gap-x-3 gap-y-1 border-l-2 pl-3",
                payment.isVoided ? "border-muted" : "border-success",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <b
                    className={cn(
                      "tabular-nums",
                      payment.isVoided && "text-muted line-through",
                    )}
                  >
                    {formatMoney(payment.amount)}
                  </b>
                  <Badge variant="outline">
                    {METHOD_LABEL[payment.method]}
                  </Badge>
                  {payment.isVoided && (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-tint-neutral text-muted"
                    >
                      dibatalkan
                    </Badge>
                  )}
                  <span className="text-xs text-muted">
                    {formatDate(payment.at)}
                    {payment.ref && ` · ${payment.ref}`}
                  </span>
                </div>

                <p className="text-xs text-muted">
                  Masuk ke {payment.channelName ?? "rekening terhapus"} ·{" "}
                  {payment.byUserName ?? "Pengguna terhapus"} · jurnal{" "}
                  <JournalLink
                    id={payment.journalEntryId}
                    number={payment.journalEntryNumber}
                    linked={mayReadLedger}
                  />
                </p>

                {/*
                  THE REASON AND THE REVERSING ENTRY, on the row they belong to.
                  A cancellation with no explanation next to it sends the reader
                  to the audit log to find out what happened.
                */}
                {payment.isVoided && (
                  <p className="text-xs text-danger-ink">
                    Dibatalkan
                    {payment.voidedAt ? ` ${formatDate(payment.voidedAt)}` : ""}
                    {payment.voidReason ? ` — ${payment.voidReason}` : ""}
                    {payment.reversalJournalEntryId && (
                      <>
                        {" · jurnal pembalik "}
                        <JournalLink
                          id={payment.reversalJournalEntryId}
                          number={payment.reversalJournalEntryNumber}
                          linked={mayReadLedger}
                        />
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="flex flex-none items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onPrint(payment)}
                >
                  <Printer className="size-4" />
                  Kwitansi
                </Button>

                {!payment.isVoided && (
                  <Can feature="customerInvoices" action="void">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => onVoid(payment)}
                    >
                      <Undo2 className="size-4" />
                      Batalkan
                    </Button>
                  </Can>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {payments.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Pembayaran tidak bisa diedit. Yang salah <b>dibatalkan</b> — sistem
          memposting jurnal pembalik dan barisnya tetap terlihat — lalu dicatat
          ulang dengan angka yang benar. Keduanya peristiwa yang benar-benar
          terjadi, jadi keduanya tercatat.
        </p>
      )}
    </Card>
  );
}

/**
 * One ledger entry, as its NUMBER, linked to the entry itself.
 *
 * THE NUMBER IS THE LABEL, THE ID IS THE ADDRESS. `JE-2026-08-0412` is what the
 * ledger is filed under and what somebody quotes; the route is keyed by id. This
 * used to render the raw ObjectId, which was neither — nobody can look up
 * "6a903c1a3d3de99c0994134a", and it was not a link either.
 *
 * FALLS BACK TO THE ID as text when the number could not be resolved — an entry
 * removed by a repair script. An id is a poor label, but a blank space where a
 * ledger reference belongs is worse: the link still works, so the reference is
 * still followable.
 */
function JournalLink({
  id,
  number,
  linked,
}: {
  id: string;
  number: string | null;
  linked: boolean;
}) {
  const label = number ?? id;

  if (!linked) {
    return <span className="tabular-nums">{label}</span>;
  }

  return (
    <Link
      href={`/dashboard/keuangan/journal-entries/${id}`}
      className="tabular-nums text-primary-hover underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
