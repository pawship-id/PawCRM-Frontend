"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Undo2 } from "lucide-react";

import { Alert, Card, JournalLink, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  CancelCashTransactionDialog,
  CashTransactionEditDialog,
  cashTransactionHref,
} from "@/features/cash-transactions";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { formatMoney } from "@/utils/decimal";
import type { CashTransaction } from "@/types/api";

import { PURCHASING_CRUMBS } from "../crumbs";
import { usePurchaseInvoice } from "../hooks/usePurchaseInvoice";
import { PageHeading } from "./PageHeading";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** How a supplier payment moved, when it went through a channel. */
const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  giro: "Giro",
};

/**
 * ONE SUPPLIER PAYMENT, on a page of its own — the sales invoice's "Detail
 * Pembayaran", for the other side of the ledger (15 October 2026, on request).
 *
 * `paymentId` IS THE CASH TRANSACTION'S ID (BKK/BBK), so changing and cancelling
 * go through Transaksi Keuangan's own dialogs: "Ubah" reverses the entry and
 * re-posts it under the same number; "Batalkan" posts a reversal and the bill's
 * paid amount drops with it. Both keep the history.
 *
 * NO KWITANSI, unlike a sales payment: a receipt is what the RECEIVER of money
 * issues, and here that is the supplier.
 *
 * ONE REQUEST — the invoice, which carries its payments with their labels.
 * After an edit or a cancel the invoice is read again: its paid amount and
 * status may have moved.
 */
export function PurchasePaymentDetail({
  invoiceId,
  paymentId,
}: {
  invoiceId: string;
  paymentId: string;
}) {
  const { invoice, loading, error, notFound, refetch } =
    usePurchaseInvoice(invoiceId);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelling, setCancelling] = useState<CashTransaction | null>(null);
  const [openingCancel, setOpeningCancel] = useState(false);
  const { can } = usePermissions();
  const mayReadLedger = can("journalEntries", "read");
  const invoiceHref = `/dashboard/purchasing/payables/${invoiceId}`;

  if (loading && !invoice) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail pembayaran…
      </div>
    );
  }

  if (notFound) {
    return (
      <Card className="text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/dashboard/purchasing/payables">
            ← Semua faktur pembelian
          </Link>
        </Button>
      </Card>
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
    (invoice.payments ?? []).find((row) => row.paymentId === paymentId) ??
    null;

  if (!payment) {
    return (
      <Card className="text-center">
        <p className="font-medium text-foreground">
          Pembayaran ini tidak ada di faktur {invoice.invoiceNumber}.
        </p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href={invoiceHref}>← Kembali ke faktur</Link>
        </Button>
      </Card>
    );
  }

  const voided = payment.isVoided ?? Boolean(payment.voidedAt);
  const title = payment.paymentNumber ?? formatMoney(payment.amount);
  const source = payment.method
    ? (METHOD_LABEL[payment.method] ?? payment.method)
    : (payment.cashAccountName ?? "Kas & Bank");

  /** The cancel dialog takes the transaction itself, read when it is asked for. */
  async function openCancel() {
    if (openingCancel) return;
    setOpeningCancel(true);
    try {
      setCancelling(await cashTransactionService.getById(paymentId));
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? err.fullMessage
          : "Pembayaran tidak dapat dimuat.",
        "error",
        6000,
      );
    } finally {
      setOpeningCancel(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.payables,
            { label: invoice.invoiceNumber, href: invoiceHref },
            { label: title },
          ]}
          title={title}
        >
          {formatMoney(payment.amount)} · Dicatat oleh{" "}
          {payment.byUserName ?? "pengguna terhapus"} · {formatDate(payment.at)}
        </PageHeading>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              voided
                ? "bg-tint-neutral text-muted"
                : "bg-tint-success text-success",
            )}
          >
            {voided ? "dibatalkan" : "aktif"}
          </span>
          {!voided && (
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
          {!voided && (
            <Can feature="cashTransactions" action="void">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={openingCancel}
                onClick={openCancel}
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
            <span className="tabular-nums">{payment.paymentNumber ?? "—"}</span>
          </Field>
          <Field label="Referensi faktur">
            <Link
              href={invoiceHref}
              className="inline-flex items-center rounded-md bg-navy-100 px-3 py-1.5 font-semibold text-primary tabular-nums hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {invoice.invoiceNumber} →
            </Link>
          </Field>
          <Field label="Supplier">{invoice.supplierName ?? "—"}</Field>
          <Field label="Keluar dari">{source}</Field>
          <Field label="Jumlah">
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                voided && "text-muted line-through",
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
              number={payment.journalEntryNumber ?? null}
              linked={mayReadLedger}
            />
          </Field>
        </dl>

        {voided && (
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
                  number={payment.reversalJournalEntryNumber ?? null}
                  linked={mayReadLedger}
                />
              </p>
            )}
          </div>
        )}

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
              {formatMoney(invoice.outstandingAmount)}
            </span>
          </Field>
        </dl>
      </Card>

      <CashTransactionEditDialog
        open={editOpen}
        transactionId={editOpen ? payment.paymentId : null}
        onClose={() => setEditOpen(false)}
        onSaved={() => refetch()}
      />

      <CancelCashTransactionDialog
        transaction={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={() => {
          setCancelling(null);
          refetch();
        }}
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
