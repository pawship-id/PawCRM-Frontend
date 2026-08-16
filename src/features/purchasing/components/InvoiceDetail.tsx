"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
// The shadcn button rather than the project wrapper: every button on this screen
// is either a link (`asChild`) or uses a shadcn-only variant, neither of which
// the wrapper's three-variant API exposes.
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, isPositive, toMinor } from "@/utils/decimal";
import type { GoodsReceiptDetail } from "@/types/api";

import { usePurchaseInvoice } from "../hooks/usePurchaseInvoice";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { PaymentHistory } from "./PaymentHistory";
import { RecordPaymentForm } from "./RecordPaymentForm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One payable: what it bills, what has been paid, and the form to pay more.
 *
 * TWO REQUESTS, AND THE SECOND IS OPTIONAL. The invoice carries its own totals;
 * the LINES belong to the goods receipt it bills, so they are fetched separately
 * and their failure is not fatal — a clerk who came here to pay a bill can still
 * pay it when the delivery's line items will not load. That is the same call
 * ReceiptsScreen makes about its headline figure.
 *
 * PAYING DOES NOT REFETCH. `recordPayment` answers with the updated invoice, so
 * the response is handed straight to `applyInvoice`: it is the exact document
 * the write produced, rather than whatever a second read happens to see, and it
 * costs one round trip instead of two.
 *
 * THE FORM DISAPPEARS ONCE SETTLED, and it is gated on `pay` besides. A role
 * that may file a bill but not settle it sees the whole picture and no way to
 * move money — the separation of duties the backend enforces, made visible
 * rather than discovered through a 403.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    usePurchaseInvoice(invoiceId);

  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);

  const goodsReceiptId = invoice?.goodsReceiptId;

  useEffect(() => {
    if (!goodsReceiptId) return;

    let active = true;

    goodsReceiptService
      .getById(goodsReceiptId)
      .then((result) => {
        if (active) setReceipt(result);
      })
      // Supporting detail, not the subject. See the header.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [goodsReceiptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail faktur…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <p className="max-w-sm text-sm text-muted">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/purchasing/payables">
            ← Semua faktur pembelian
          </Link>
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
  const paidMinor = toMinor(invoice.paidAmount) ?? 0n;
  const totalMinor = toMinor(invoice.total) ?? 0n;
  // Integer arithmetic on minor units, then a single narrowing to Number for the
  // width of a bar. Nothing financial is decided from this value.
  const percent = totalMinor > 0n ? Number((paidMinor * 100n) / totalMinor) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Faktur" value={invoice.invoiceNumber} mono />
        <Field label="Supplier" value={invoice.supplierName ?? "—"} />
        <Field
          label="Penerimaan"
          value={invoice.goodsReceiptNumber ?? "—"}
          mono
          href={`/dashboard/purchasing/receipts/${invoice.goodsReceiptId}`}
        />
        <Field label="Tanggal faktur" value={formatDate(invoice.invoiceDate)} />
        <Field
          label="Jatuh tempo"
          value={formatDate(invoice.dueDate)}
          tone={invoice.isOverdue ? "danger" : undefined}
        />
        <div className="ml-auto">
          <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
            Status
          </p>
          <div className="mt-1">
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
      </div>

      {invoice.isOverdue && (
        <Alert variant="error">
          Faktur ini sudah lewat jatuh tempo ({formatDate(invoice.dueDate)}).
        </Alert>
      )}

      <Card title="Progres pembayaran">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between text-sm">
            <span className="text-muted">
              Terbayar {formatMoney(invoice.paidAmount)} dari{" "}
              {formatMoney(invoice.total)}
            </span>
            <b className="tabular-nums">{percent}%</b>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="text-sm">
            Sisa tagihan{" "}
            <b
              className={cn(
                "tabular-nums",
                isPositive(invoice.outstandingAmount) && "text-danger",
              )}
            >
              {formatMoney(invoice.outstandingAmount)}
            </b>
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card title="Barang pada penerimaan yang ditagih">
          {receipt === null ? (
            <p className="py-6 text-center text-sm text-muted">
              Rincian barang tidak dapat dimuat. Angka faktur di atas tetap
              berlaku.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                    <th className="px-2 py-2 text-left font-medium">Produk</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Harga beli
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr
                      key={item.itemId}
                      className="border-b border-border/60 last:border-0"
                    >
                      {/* The snapshot name, not today's: this is what the bill
                          was for, and a product renamed since must not restate
                          a document the supplier also holds a copy of. */}
                      <td className="px-2 py-2 text-xs">{item.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs">
                        {formatQty(item.qty)}
                        {item.productUnit && (
                          <span className="ml-1 text-muted">
                            {item.productUnit}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs">
                        {formatMoney(item.costPerUnit)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs">
                        {formatMoney(item.subtotal)}
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-right text-xs text-muted"
                    >
                      Subtotal (sebelum PPN)
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs">
                      {formatMoney(invoice.subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-right text-xs text-muted"
                    >
                      PPN
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs">
                      {formatMoney(invoice.taxAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-right text-xs font-semibold"
                    >
                      Total faktur
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-sm font-semibold">
                      {formatMoney(invoice.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {settled ? (
            <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              Faktur ini sudah lunas.
            </div>
          ) : (
            <Can
              feature="purchaseInvoices"
              action="pay"
              fallback={
                <div className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm">
                  Anda tidak punya izin mencatat pembayaran. Hubungi pemegang
                  hak <span className="tabular-nums text-xs">purchaseInvoices:pay</span>.
                </div>
              }
            >
              <Card title="Catat pembayaran">
                <RecordPaymentForm invoice={invoice} onPaid={applyInvoice} />
              </Card>
            </Can>
          )}

          {invoice.notes && (
            <Card title="Catatan">
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <PaymentHistory payments={invoice.payments} />

      {/* NOT "no journal was posted". The payable was credited to 2101 by the
          goods receipt when it posted; the invoice deliberately posts nothing,
          because a second AP entry would book the same obligation twice. */}
      <p className="text-xs text-muted">
        Utang atas penerimaan ini sudah dikreditkan ke <b>2101 Utang Supplier</b>{" "}
        sejak barang diterima — faktur ini yang membawa nomor tagihan dan tanggal
        jatuh temponya. Dicatat oleh {invoice.createdByName ?? "—"}.
      </p>

      <div>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/purchasing/payables">
            ← Semua faktur pembelian
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  tone,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "danger";
  href?: string;
}) {
  const body = (
    <span
      className={cn(
        "mt-1 block text-sm font-semibold",
        mono && "tabular-nums",
        tone === "danger" && "text-danger",
        href && "text-primary-hover hover:underline",
      )}
    >
      {value}
    </span>
  );

  return (
    <div>
      <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </p>
      {href ? <Link href={href}>{body}</Link> : body}
    </div>
  );
}
