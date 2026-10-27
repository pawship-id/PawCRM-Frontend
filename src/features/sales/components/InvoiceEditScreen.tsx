"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, Card, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { InvoiceEditor } from "./InvoiceEditor";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * PELANGGAN, CABANG AND TANGGAL FAKTUR ARE LOCKED (26 October 2026, BO): shown
 * here read-only, never sent. The date anchors the journal, stock movements,
 * number series, due date and benefit quota — moving it is its own decision.
 *
 * ITS OWN PAGE since 26 October 2026 (BO) — the same shape as Ubah faktur on
 * Pembelian, instead of an editor opened inside the detail.
 *
 * Loads the invoice and hands it to the editor — or says why it cannot be
 * edited. The rule is the detail page's: raised here, unpaid, no active
 * payment. Re-checked on load, so a stale link to a faktur paid since lands on
 * the reason, not on an editor that would save into a refusal.
 */
export function InvoiceEditScreen({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { invoice, loading, error, notFound } = useCustomerInvoice(invoiceId);
  const { can } = usePermissions();

  const detailHref = `/dashboard/sales/invoice/${invoiceId}`;
  const crumbs = [
    ...SALES_CRUMBS,
    { label: invoice?.invoiceNumber ?? "Detail faktur", href: detailHref },
    { label: "Ubah" },
  ];

  const heading = (
    <PageHeading
      crumbs={crumbs}
      title={`Ubah faktur ${invoice?.invoiceNumber ?? ""}`.trim()}
    />
  );

  if (loading && !invoice) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat faktur…
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Alert variant="error">Faktur tidak ditemukan.</Alert>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Alert variant="error">{error ?? "Gagal memuat faktur."}</Alert>
      </div>
    );
  }

  const tillBorn =
    invoice.source === "pos_bridge" || !!invoice.posTransactionId;
  const hasActivePayment = (invoice.payments ?? []).some(
    (payment) => !payment.isVoided,
  );
  const editable =
    !tillBorn && invoice.status === "unpaid" && !hasActivePayment;

  if (!editable || !can("customerInvoices", "update")) {
    const reason = tillBorn
      ? "lahir dari penjualan kasir — barisnya milik transaksi kasir"
      : invoice.status === "void"
        ? "sudah dibatalkan"
        : !editable
          ? "sudah ada pembayaran tercatat — batalkan pembayarannya dulu"
          : "Anda tidak punya izin mengubah faktur";

    return (
      <div className="flex flex-col gap-6">
        {heading}
        <Alert variant="info">
          Faktur {invoice.invoiceNumber} tidak bisa diubah: {reason}.{" "}
          <Link href={detailHref} className="font-semibold underline">
            Kembali ke faktur
          </Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {heading}
      <Card
        title="Rincian faktur"
        description="Pelanggan, cabang dan tanggal faktur dikunci — yang bisa diubah: baris, diskon, biaya lain dan jatuh tempo."
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3" aria-hidden />
              Pelanggan
            </dt>
            <dd className="mt-0.5 font-medium">
              {invoice.customerName ??
                (invoice.customerId ? "Pelanggan terhapus" : "Pelanggan umum")}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3" aria-hidden />
              Cabang
            </dt>
            <dd className="mt-0.5 font-medium">{invoice.branchName ?? "—"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3" aria-hidden />
              Tanggal faktur
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {formatDate(invoice.invoiceDate)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-border pt-4">
          <InvoiceEditor
            invoice={invoice}
            onCancel={() => router.push(detailHref)}
            onSaved={() => router.push(detailHref)}
          />
        </div>
      </Card>
    </div>
  );
}
