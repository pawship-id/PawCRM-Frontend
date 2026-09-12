"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Printer, Undo2 } from "lucide-react";

import { Alert, Card, JournalLink, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  CashTransactionEditDialog,
  cashTransactionHref,
} from "@/features/cash-transactions";
import { Can, usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { paymentChannelLabel, paymentTitle } from "../paymentLabels";
import { PaymentReceiptDialog } from "./PaymentReceiptDialog";
import { VoidPaymentDialog } from "./VoidPaymentDialog";

function formatDate(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * ONE PAYMENT, on a page of its own — the mockup's "Detail Pembayaran".
 *
 * EDITABLE SINCE D4 (11 Sep 2026), and the edit is not a rewrite. "Ubah
 * pembayaran" opens the same dialog Transaksi Keuangan uses — `paymentId` IS the
 * cash transaction's id — which reverses the payment's journal entry and posts a
 * new one under the SAME number. The earlier version stays in the transaction's
 * Riwayat perubahan, so a figure already on a bank statement never becomes
 * untraceable. Cancelling stays here too, through the invoice's own route.
 *
 * A URL, NOT A DIALOG, for the same reason the print sheet has one: "send me the
 * link to that transfer" is an ordinary request, and a dialog cannot be linked
 * to or opened in a second tab beside the bank statement it is checked against.
 *
 * ONE REQUEST — the invoice, which already carries its payments with every label
 * resolved. After an edit the invoice is read again: the paid amount and status
 * may have moved with it.
 */
export function InvoicePaymentDetail({
  invoiceId,
  paymentId,
}: {
  invoiceId: string;
  paymentId: string;
}) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    useCustomerInvoice(invoiceId);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { can } = usePermissions();
  const mayReadLedger = can("journalEntries", "read");
  const invoiceHref = `/dashboard/sales/${invoiceId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail pembayaran…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/sales">← Semua faktur penjualan</Link>
        </Button>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">
          {error ?? "Gagal memuat detail pembayaran. Coba lagi."}
        </Alert>
        <div>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  const payment =
    invoice.payments.find((row) => row.paymentId === paymentId) ?? null;

  if (!payment) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">
          Pembayaran ini tidak ada di faktur {invoice.invoiceNumber}.
        </p>
        <Button variant="secondary" asChild>
          <Link href={invoiceHref}>← Kembali ke faktur</Link>
        </Button>
      </div>
    );
  }

  /*
    CANCELLABLE AND EDITABLE ONLY WHILE IT COUNTS, and never on a cancelled
    invoice — voiding the invoice already required every payment on it to be
    cancelled first, so there is nothing left to change there.
  */
  const changeable = !payment.isVoided && invoice.status !== "void";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[
            ...SALES_CRUMBS,
            { label: invoice.invoiceNumber, href: invoiceHref },
            { label: paymentTitle(payment) },
          ]}
          title={paymentTitle(payment)}
        >
          {formatMoney(payment.amount)} · Dicatat oleh{" "}
          {payment.byUserName ?? "pengguna terhapus"} · {formatDate(payment.at)}
          {payment.recordedVia && (
            <>
              {" "}
              ·{" "}
              {payment.recordedVia === "pos"
                ? "Dicatat di kasir"
                : "Dicatat di back office"}
            </>
          )}
        </PageHeading>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              payment.isVoided
                ? "bg-tint-neutral text-muted"
                : "bg-tint-success text-success",
            )}
          >
            {payment.isVoided ? "dibatalkan" : "aktif"}
          </span>
          {/* A cancelled payment still prints: re-printing one is usually done
              precisely because it was cancelled. */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReceiptOpen(true)}
          >
            <Printer className="size-4" />
            Kwitansi
          </Button>
          {changeable && (
            <Can feature="cashTransactions" action="update">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
                Ubah pembayaran
              </Button>
            </Can>
          )}
          {changeable && (
            <Can feature="customerInvoices" action="void">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setVoidOpen(true)}
              >
                <Undo2 className="size-4" />
                Batalkan pembayaran
              </Button>
            </Can>
          )}
        </div>
      </div>

      <Card
        title="Rincian pembayaran"
        description="Yang salah bisa diubah — nomornya tetap, jurnalnya dibalik lalu diposting ulang — atau dibatalkan, dan sisa tagihan fakturnya ikut menyesuaikan."
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="No. pembayaran">
            <span className="tabular-nums">
              {payment.paymentNumber ?? "—"}
            </span>
          </Field>
          <Field label="Referensi faktur">
            <Link
              href={invoiceHref}
              className="inline-flex items-center rounded-md bg-navy-100 px-3 py-1.5 font-semibold text-primary tabular-nums hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {invoice.invoiceNumber} →
            </Link>
          </Field>
          <Field label="Channel pembayaran">{paymentChannelLabel(payment)}</Field>
          <Field label="Jumlah">
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                payment.isVoided && "text-muted line-through",
              )}
            >
              {formatMoney(payment.amount)}
            </span>
          </Field>
          <Field label="Tanggal">
            <span className="tabular-nums">{formatDate(payment.at)}</span>
          </Field>
          <Field label="No. referensi">
            <span className="tabular-nums">{payment.ref ?? "—"}</span>
          </Field>
          <Field label="Jurnal">
            <JournalLink
              id={payment.journalEntryId}
              number={payment.journalEntryNumber}
              linked={mayReadLedger}
            />
          </Field>
        </dl>

        {/*
          THE REASON AND THE REVERSING ENTRY, on the page they belong to. A
          cancellation with no explanation beside it sends the reader to the audit
          log to find out what happened.
        */}
        {payment.isVoided && (
          <div className="mt-5 rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
            <p className="font-semibold">
              Dibatalkan{" "}
              <span className="tabular-nums">
                {payment.voidedAt ? formatDate(payment.voidedAt) : ""}
              </span>
            </p>
            {payment.voidReason && (
              <p className="mt-1">Alasan: {payment.voidReason}</p>
            )}
            {payment.reversalJournalEntryId && (
              <p className="mt-1 text-muted">
                Jurnal pembalik{" "}
                <JournalLink
                  id={payment.reversalJournalEntryId}
                  number={payment.reversalJournalEntryNumber}
                  linked={mayReadLedger}
                />
              </p>
            )}
          </div>
        )}

        {/* Where its revisions, MDR and both journal entries are laid out. */}
        <Can feature="cashTransactions" action="read">
          <p className="mt-5 text-sm">
            <Link
              href={cashTransactionHref(payment.paymentId)}
              className="rounded-md font-semibold text-primary underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Lihat di Transaksi Keuangan →
            </Link>
          </p>
        </Can>
      </Card>

      <Card title="Faktur ini sekarang">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Total tagihan">
            <span className="tabular-nums">{formatMoney(invoice.total)}</span>
          </Field>
          <Field label="Terbayar">
            <span className="tabular-nums">
              {formatMoney(invoice.paidAmount)}
            </span>
          </Field>
          <Field label="Sisa">
            <span className="font-semibold tabular-nums">
              {invoice.status === "void"
                ? "—"
                : formatMoney(invoice.outstandingAmount)}
            </span>
          </Field>
        </dl>
      </Card>

      <PaymentReceiptDialog
        invoice={invoice}
        payment={receiptOpen ? payment : null}
        onClose={() => setReceiptOpen(false)}
      />

      <VoidPaymentDialog
        invoice={invoice}
        payment={voidOpen ? payment : null}
        onClose={() => setVoidOpen(false)}
        onVoided={applyInvoice}
      />

      {/* Loads the transaction itself — the invoice row lacks its channel type
          and revisions — and re-reads the invoice after, since the paid amount
          may have moved with the edit. */}
      <CashTransactionEditDialog
        open={editOpen}
        transactionId={editOpen ? payment.paymentId : null}
        onClose={() => setEditOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}

/** One label/value pair. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
