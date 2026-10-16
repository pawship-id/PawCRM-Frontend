"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type { PurchaseInvoiceDetail } from "@/types/api";

import { PURCHASING_CRUMBS } from "../crumbs";
import { usePurchaseInvoice } from "../hooks/usePurchaseInvoice";
import { PageHeading } from "./PageHeading";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { PaymentTimeline } from "@/features/cash-transactions/components/PaymentTimeline";
import { PurchaseActivityCard } from "./PurchaseActivityCard";
import { ReceiptStatusBadge } from "./ReceiptStatusBadge";
import { Plus } from "lucide-react";
import { PaymentStatusCard } from "@/features/cash-transactions/components/PaymentStatusCard";
import {
  PaymentForm,
  RecordPaymentDialog,
} from "@/features/cash-transactions/components/RecordPaymentDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One supplier invoice: its own lines and how much of each has arrived, what
 * has been paid, and the form to pay more.
 *
 * TWO LIVES (14 October 2026, BO):
 *
 *   MANUAL, NO RECEIPT YET — filed before the goods. Editable and deletable;
 *     nothing is owed, so nothing can be paid. "Buat penerimaan barang" makes
 *     the receipt from these lines and LOCKS the invoice.
 *   LINKED — its lines are the receipt's. The payable grows as goods are
 *     received, and payment is capped at what has arrived (`payableAmount`).
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    usePurchaseInvoice(invoiceId);

  if (loading && !invoice) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail faktur…
      </div>
    );
  }

  if (notFound) {
    return (
      <Card className="text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <p className="mt-1 text-sm text-muted">
          Nomor ini tidak ada, sudah dihapus, atau bukan milik tenant Anda.
        </p>
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

  return <InvoiceBody invoice={invoice} applyInvoice={applyInvoice} />;
}

function InvoiceBody({
  invoice,
  applyInvoice,
}: {
  invoice: PurchaseInvoiceDetail;
  applyInvoice: (invoice: PurchaseInvoiceDetail) => void;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const linked = Boolean(invoice.goodsReceiptId);
  // ONE INVOICE, MANY RECEIPTS (16 October 2026, BO): goods arrive over
  // several days, one receipt each. Still to come while any line has some left.
  const receipts = invoice.goodsReceipts ?? [];
  const stillToCome = (invoice.items ?? []).some(
    (item) => (toMinor(item.remainingQty ?? "0") ?? 0n) > 0n,
  );
  const settled = invoice.status === "paid";
  const totalMinor = toMinor(invoice.total) ?? 0n;
  const payableMinor = toMinor(invoice.payableAmount) ?? 0n;
  const receivedMinor = toMinor(invoice.receivedAmount) ?? 0n;
  // Integer arithmetic on minor units, then a single narrowing to Number for
  // the width of a bar. Nothing financial is decided from this value.
  const receivedPercent =
    totalMinor > 0n ? Number((receivedMinor * 100n) / totalMinor) : 0;

  // The receipt form, opened on this invoice's lines — nothing is written
  // until it is saved there.
  function makeReceipt() {
    router.push(`/dashboard/purchasing/receipts/new?invoice=${invoice._id}`);
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await purchaseInvoiceService.remove(invoice._id);
      swalToast(`Faktur ${invoice.invoiceNumber} dihapus.`);
      router.replace("/dashboard/purchasing/payables");
    } catch (err) {
      swalToast(
        err instanceof ApiError ? err.fullMessage : "Gagal menghapus faktur.",
        "error",
        6000,
      );
      setBusy(false);
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* THE NUMBER IS THE TITLE, the status beside it — as a sales invoice's
          page reads (15 October 2026, on request). */}
      <PageHeading
        crumbs={[
          PURCHASING_CRUMBS.hub,
          PURCHASING_CRUMBS.payables,
          { label: invoice.invoiceNumber },
        ]}
        title={invoice.invoiceNumber}
        aside={<InvoiceStatusBadge status={invoice.status} />}
      >
        {invoice.supplierName ?? "Supplier terhapus"} ·{" "}
        {invoice.branchName ?? "—"} · {invoice.warehouseName ?? "—"}
      </PageHeading>

      {linked && stillToCome && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-warning px-4 py-3 text-sm text-foreground">
          <span>
            <b>Sebagian barang belum diterima.</b> Catat kedatangan berikutnya
            sebagai penerimaan baru — yang bisa dipilih hanya barang yang
            belum lengkap diterima.
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Can feature="goodsReceipts" action="create">
              <Button onClick={makeReceipt} disabled={busy}>
                Buat penerimaan barang
              </Button>
            </Can>
          </div>
        </div>
      )}

      {!linked && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-warning px-4 py-3 text-sm text-foreground">
          <span>
            <b>Barang dari faktur ini belum diterima.</b> Belum ada utang yang
            tercatat dan faktur belum bisa dibayar. Buat penerimaan barang saat
            barangnya datang — barangnya disalin dari faktur ini dan faktur
            terkunci. Kalau barangnya datang bertahap, setiap kedatangan dicatat
            sebagai penerimaan sendiri.
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Can feature="purchaseInvoices" action="create">
              <Button
                variant="ghost"
                onClick={() => setDeleting(true)}
                disabled={busy}
              >
                Hapus
              </Button>
              <Button variant="secondary" asChild>
                <Link href={`/dashboard/purchasing/payables/${invoice._id}/edit`}>
                  Ubah faktur
                </Link>
              </Button>
            </Can>
            <Can feature="goodsReceipts" action="create">
              <Button onClick={makeReceipt} disabled={busy}>
                Buat penerimaan barang
              </Button>
            </Can>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Hapus faktur ${invoice.invoiceNumber}?`}
          confirmLabel="Hapus faktur"
          destructive
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(false)}
        >
          Faktur ini belum punya penerimaan barang dan belum dibayar, jadi aman
          dihapus.
        </ConfirmDialog>
      )}

      {invoice.isOverdue && (
        <Alert variant="error">
          Faktur ini sudah lewat jatuh tempo ({formatDate(invoice.dueDate)}).
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* RINCIAN FAKTUR — the sales invoice's card: who and when on top, the
            lines, then the recap at the right. */}
        <Card
          title="Rincian faktur"
          description={
            linked
              ? "Barangnya sama dengan penerimaan barang dan tidak bisa diubah lagi."
              : "Masih bisa diubah sampai penerimaan barang dibuat dari faktur ini."
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Supplier">{invoice.supplierName ?? "—"}</Field>
            <Field label="Cabang">{invoice.branchName ?? "—"}</Field>
            <Field label="Gudang">{invoice.warehouseName ?? "—"}</Field>
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
            <Field label="Dibuat oleh">{invoice.createdByName ?? "—"}</Field>
            <Field label="Penerimaan barang">
              {receipts.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {receipts.map((row) => (
                    <Link
                      key={row._id}
                      href={`/dashboard/purchasing/receipts/${row._id}`}
                      className="font-semibold text-primary tabular-nums hover:underline"
                    >
                      {row.receiptNumber}
                      {row.receiptDate && (
                        <span className="ml-1 font-normal text-muted">
                          · {formatDate(row.receiptDate)}
                        </span>
                      )}{" "}
                      →
                    </Link>
                  ))}
                </span>
              ) : invoice.goodsReceiptId ? (
                <Link
                  href={`/dashboard/purchasing/receipts/${invoice.goodsReceiptId}`}
                  className="font-semibold text-primary tabular-nums hover:underline"
                >
                  {invoice.goodsReceiptNumber ?? "Lihat"} →
                </Link>
              ) : (
                <span className="text-muted">belum ada</span>
              )}
            </Field>
            <Field label="Status barang">
              {!linked ? (
                <span className="text-muted">belum diterima</span>
              ) : receipts.length > 0 ? (
                // Across every receipt: complete only when nothing is left.
                <ReceiptStatusBadge status={stillToCome ? "partial" : "received"} />
              ) : invoice.goodsReceiptStatus ? (
                <ReceiptStatusBadge status={invoice.goodsReceiptStatus} />
              ) : (
                <span className="text-muted">belum diterima</span>
              )}
            </Field>
          </dl>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Diterima</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoice.items ?? []).map((item) => {
                      const cancelledMinor = toMinor(item.cancelledQty) ?? 0n;

                      return (
                        <TableRow key={item.invoiceItemId}>
                          <TableCell>
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted tabular-nums">
                              {item.productSku ?? "—"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatMoney(item.costPerUnit)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatQty(item.qty)}
                            {item.productUnit && (
                              <span className="ml-1 text-muted">
                                {item.productUnit}
                              </span>
                            )}
                            {cancelledMinor > 0n && (
                              <span className="block text-xs text-danger">
                                batal {formatQty(item.cancelledQty)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {item.receivedQty === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              formatQty(item.receivedQty)
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">
                            {formatMoney(item.subtotal)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {(invoice.items ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted">
                  Faktur lama ini belum punya rincian barang — lihat
                  penerimaannya.
                </p>
              )}

              <dl className="flex w-full flex-col gap-2 self-end text-sm sm:w-80">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular-nums">
                    {formatMoney(invoice.subtotal)}
                  </dd>
                </div>
                {(toMinor(invoice.taxAmount) ?? 0n) > 0n && (
                  <div className="flex justify-between gap-4 border-t border-dashed border-border pt-2">
                    <dt className="text-muted">PPN masukan</dt>
                    <dd className="tabular-nums">
                      {formatMoney(invoice.taxAmount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t-[1.5px] border-primary pt-2.5 text-base font-bold">
                  <dt>Total tagihan</dt>
                  <dd className="tabular-nums">{formatMoney(invoice.total)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {invoice.notes && (
            <p className="mt-4 border-t border-border pt-4 text-sm whitespace-pre-wrap">
              {invoice.notes}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          {/* THE SAME CARD AS A SALES INVOICE (15 October 2026, on request) —
              plus one line only a supplier bill needs: it can be paid only as
              far as its goods have arrived. */}
          <PaymentStatusCard
            total={invoice.total}
            paid={invoice.paidAmount}
            outstanding={invoice.outstandingAmount}
            dueDate={invoice.dueDate}
            settled={settled}
            extra={
              !settled && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-info"
                      style={{ width: `${Math.min(100, receivedPercent)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    Barang diterima {formatMoney(invoice.receivedAmount)} dari{" "}
                    {formatMoney(invoice.total)} · bisa dibayar sekarang{" "}
                    <b className="text-foreground">
                      {formatMoney(invoice.payableAmount)}
                    </b>
                  </p>
                </div>
              )
            }
          >
            {!settled && payableMinor <= 0n && (
              <p className="rounded-lg bg-tint-neutral px-3 py-2 text-sm">
                Belum ada yang bisa dibayar —{" "}
                {linked
                  ? "barang yang sudah diterima sudah dibayar semua. Sisanya bisa dibayar setelah barangnya diterima."
                  : "barangnya belum diterima."}
              </p>
            )}
            {!settled && payableMinor > 0n && (
              <Can
                feature="purchaseInvoices"
                action="pay"
                fallback={
                  <p className="text-xs text-muted">
                    Anda tidak punya izin mencatat pembayaran. Hubungi pemegang
                    hak{" "}
                    <span className="tabular-nums">purchaseInvoices:pay</span>.
                  </p>
                }
              >
                <Button className="w-full" onClick={() => setPayOpen(true)}>
                  <Plus className="size-4" />
                  Catat pembayaran
                </Button>
              </Can>
            )}
          </PaymentStatusCard>

          {/* THE SAME TIMELINE AS A SALES INVOICE — each row opens the
              payment's own page, as it does there. */}
          <PaymentTimeline
            payments={invoice.payments ?? []}
            hrefFor={(payment) =>
              `/dashboard/purchasing/payables/${invoice._id}/payments/${payment.paymentId}`
            }
            labelFor={(payment) =>
              payment.method
                ? (PAYMENT_METHOD_LABEL[payment.method] ?? payment.method)
                : (payment.cashAccountName ?? "Kas & Bank")
            }
          />


        </div>
      </div>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        description="Untuk DP, cicilan, dan pelunasan ke supplier. Yang bisa dibayar hanya barang yang sudah diterima."
        summaryLabel="Bisa dibayar sekarang"
        summaryAmount={invoice.payableAmount}
        summaryCaption={`${invoice.invoiceNumber} · ${invoice.supplierName ?? "Supplier terhapus"} · sisa tagihan ${formatMoney(invoice.outstandingAmount)}`}
      >
        <PaymentForm
          key={payOpen ? "open" : "closed"}
          direction="out"
          ceiling={invoice.payableAmount}
          overCeilingMessage={
            (toMinor(invoice.payableAmount) ?? 0n) <
            (toMinor(invoice.outstandingAmount) ?? 0n)
              ? `Jumlah melebihi nilai barang yang sudah diterima dan belum dibayar (${formatMoney(invoice.payableAmount)}).`
              : `Jumlah melebihi sisa tagihan ${formatMoney(invoice.outstandingAmount)}.`
          }
          onCancel={() => setPayOpen(false)}
          onSubmit={async (input) => {
            const next = await purchaseInvoiceService.recordPayment(
              invoice._id,
              input,
            );
            applyInvoice(next);
            setVersion((value) => value + 1);
            setPayOpen(false);
          }}
          note={
            <Alert variant="info">
              Setelah disimpan, status faktur naik sendiri ke{" "}
              <strong>sebagian</strong> atau <strong>lunas</strong>. Pembayaran
              langsung memposting jurnal dan tidak bisa dibatalkan dari sini.
            </Alert>
          }
        />
      </RecordPaymentDialog>


      <PurchaseActivityCard kind="invoice" id={invoice._id} version={version} />

    </div>
  );
}

/** How a supplier payment moved, when it was recorded through a channel. */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  giro: "Giro",
};

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
