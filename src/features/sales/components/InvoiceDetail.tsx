"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
// The shadcn button rather than the project wrapper: every button on this screen
// is a link (`asChild`) or uses a shadcn-only variant, neither of which the
// wrapper's three-variant API exposes.
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { formatMoney } from "@/utils/decimal";
import { daysUntil } from "@/utils/date";
import { cn } from "@/lib/utils";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { InvoiceSourceBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { PaymentHistory } from "./PaymentHistory";
import { PaymentReceiptDialog } from "./PaymentReceiptDialog";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { VoidPaymentDialog } from "./VoidPaymentDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One receivable: what is owed, what has arrived, and the form to record more.
 *
 * ONE REQUEST. Unlike the payable's detail — which fetches the goods receipt to
 * show what it bills — a receivable carries its own totals and nothing else to
 * join. THE LINE ITEMS ARE NOT HERE, and their absence is the backend's shape
 * rather than an omission: `customerinvoices` stores a total, not an `items[]`.
 * They arrive with PCR-030, when an invoice can be raised by hand and has lines
 * of its own to store.
 *
 * RECORDING A PAYMENT DOES NOT REFETCH. `recordPayment` answers with the updated
 * invoice, so the response is handed straight to `applyInvoice`: it is the exact
 * document the write produced, rather than whatever a second read happens to
 * see, and it costs one round trip instead of two.
 *
 * THE FORM DISAPPEARS ONCE SETTLED OR VOIDED, and it is gated on `pay` besides.
 * A role that may read receivables but not take money sees the whole picture and
 * no way to move any — the separation of duties the backend enforces, made
 * visible rather than discovered through a 403.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    useCustomerInvoice(invoiceId);

  /*
    ONE PAYMENT AT A TIME, held by id rather than by object. The invoice is
    replaced wholesale after a cancellation, so a held object would be the stale
    copy from before the write — the dialog would then print a kwitansi that
    still said "aktif" for a payment it had just cancelled.
  */
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail faktur…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <p className="max-w-sm text-sm text-muted">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
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
          {error ?? "Gagal memuat detail faktur. Coba lagi."}
        </Alert>
        <div>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  const settled = invoice.status === "paid";
  const voided = invoice.status === "void";
  const lateBy = Math.abs(daysUntil(invoice.dueDate));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[...SALES_CRUMBS, { label: invoice.invoiceNumber }]}
          title={invoice.invoiceNumber}
        >
          {invoice.customerName ?? "Pelanggan terhapus"} · {invoice.branchName ?? "—"}
        </PageHeading>

        <div className="flex items-center gap-2">
          <InvoiceSourceBadge source={invoice.source} />
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </div>

      {/*
        THE OVERDUE BANNER IS THE SERVER'S VERDICT, not a date comparison done
        here. `isOverdue` already folds in "not settled and not void", which a
        calendar-only test would miss: `dueDate` keeps its value after payment,
        so every invoice ever paid late would light this up.
      */}
      {invoice.isOverdue && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">Lewat jatuh tempo {lateBy} hari</b> — sisa{" "}
          {formatMoney(invoice.outstandingAmount)} belum tertagih.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <Card title="Rincian faktur">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Pelanggan">
              {invoice.customerName ?? "Pelanggan terhapus"}
            </Field>
            <Field label="Cabang">{invoice.branchName ?? "—"}</Field>
            <Field label="Dibuat oleh">
              {/* Null on a till-born invoice: the sale recorded who rang it up,
                  the receivable it raised did not stamp a separate author. */}
              {invoice.createdByName ?? "Otomatis dari kasir"}
            </Field>
            <Field label="Tanggal faktur">
              <span className="tabular-nums">
                {formatDate(invoice.invoiceDate)}
              </span>
            </Field>
            <Field label="Jatuh tempo">
              <span
                className={cn(
                  "tabular-nums",
                  invoice.isOverdue && "font-semibold text-danger-ink",
                )}
              >
                {formatDate(invoice.dueDate)}
              </span>
            </Field>
            <Field label="Sumber">
              {invoice.source === "pos_bridge"
                ? "Bridging dari kasir"
                : "Dibuat manual"}
            </Field>
          </dl>

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
            <Row label="Total tagihan" value={formatMoney(invoice.total)} />
            <Row
              label="Sudah dibayar"
              value={formatMoney(invoice.paidAmount)}
              muted
            />
            <Row
              label="Sisa tagihan"
              value={voided ? "—" : formatMoney(invoice.outstandingAmount)}
              strong
            />
          </div>

          {invoice.notes && (
            <p className="mt-4 border-t border-border pt-4 text-sm whitespace-pre-wrap">
              {invoice.notes}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {voided ? (
            <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
              Faktur ini sudah di-void — tidak ada yang bisa ditagih. Nomornya
              tetap tercatat dan tidak akan dipakai ulang.
            </div>
          ) : settled ? (
            <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              Faktur ini sudah lunas.
            </div>
          ) : (
            <Can
              feature="customerInvoices"
              action="pay"
              fallback={
                <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
                  Anda tidak punya izin mencatat pembayaran. Hubungi pemegang hak{" "}
                  <span className="tabular-nums text-xs">
                    customerInvoices:pay
                  </span>
                  .
                </div>
              }
            >
              <Card title="Catat pembayaran">
                <RecordPaymentForm invoice={invoice} onPaid={applyInvoice} />
              </Card>
            </Can>
          )}
        </div>
      </div>

      <PaymentHistory
        payments={invoice.payments}
        onPrint={(payment) => setReceiptFor(payment.paymentId)}
        onVoid={(payment) => setVoidingId(payment.paymentId)}
      />

      <PaymentReceiptDialog
        invoice={invoice}
        payment={
          invoice.payments.find((row) => row.paymentId === receiptFor) ?? null
        }
        onClose={() => setReceiptFor(null)}
      />

      <VoidPaymentDialog
        invoice={invoice}
        payment={
          invoice.payments.find((row) => row.paymentId === voidingId) ?? null
        }
        onClose={() => setVoidingId(null)}
        onVoided={applyInvoice}
      />

      {/*
        NOT "no journal was posted". The debt was debited to 1103 by the SALE
        when it posted; this document is that debt's paperwork. Saying so here is
        what stops somebody looking for a second entry that recognises it.
      */}
      <p className="text-xs text-muted">
        Piutang ini sudah didebit ke <b>1103 Piutang Usaha</b> saat penjualannya
        diposting. Tiap pembayaran memposting jurnalnya sendiri —{" "}
        <b>Dr rekening penerima / Cr 1103</b> — dan jurnal itu permanen.
      </p>

      <div>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/sales">← Semua faktur penjualan</Link>
        </Button>
      </div>
    </div>
  );
}

/** One label/value pair in the header grid. */
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
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** One line of the money summary. */
function Row({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn("text-sm", muted ? "text-muted" : "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-base font-semibold" : "text-sm",
          muted && "text-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
