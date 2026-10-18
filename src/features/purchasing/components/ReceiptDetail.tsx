"use client";

import { SkuText } from "@/components/SkuText";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, sumDecimals, toMinor } from "@/utils/decimal";
import { Can } from "@/features/permissions";
import { ExpiryBadge } from "@/features/inventory/components/ExpiryBadge";
import type { GoodsReceiptDetail as Receipt } from "@/types/api";

import { useGoodsReceipt } from "../hooks/useGoodsReceipt";
import { useReceiptLots } from "../hooks/useReceiptLots";
import { useReceiptReturns } from "../hooks/useReceiptReturns";
import { PURCHASING_CRUMBS } from "../crumbs";
import { PageHeading } from "./PageHeading";
import { PurchaseActivityCard } from "./PurchaseActivityCard";
import {
  ReceiptStatusBadge,
} from "./ReceiptStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One goods receipt: what was ordered, how much of it has arrived, and what it
 * set in motion.
 *
 * RECEIVING IS PER LINE (14 October 2026, BO). A delivery is filed `pending`,
 * received over as many visits to the receiving PAGE as the goods take — each a
 * receiving event that posts only the difference — and ends `received` (all of
 * it) or `closed` (the rest will not come). While `partial`, a received
 * quantity may still be corrected, up or down, on that page.
 *
 * THE LINES NEVER CHANGE HERE. What was ordered is fixed when the receipt is
 * filed — copied from the supplier invoice when it came from one — and only how
 * much of it arrived moves. A wrong delivery after it is complete is a return.
 */
export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const { receipt, loading, error, notFound, refetch } =
    useGoodsReceipt(receiptId);

  if (loading && !receipt) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail penerimaan…
      </div>
    );
  }

  if (notFound) {
    return (
      <Card className="text-center">
        <p className="text-sm font-medium text-foreground">
          Penerimaan tidak ditemukan.
        </p>
        <p className="mt-1 text-sm text-muted">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/dashboard/purchasing/receipts">← Semua penerimaan</Link>
        </Button>
      </Card>
    );
  }

  if (error || !receipt) {
    return (
      <Alert variant="error">
        {error ?? "Gagal memuat detail penerimaan."}{" "}
        <button
          type="button"
          onClick={refetch}
          className="font-medium underline underline-offset-2"
        >
          Coba lagi
        </button>
      </Alert>
    );
  }

  return <ReceiptBody receipt={receipt} />;
}

/**
 * Split from the guard clauses above so the hooks that decorate a LOADED receipt
 * — its lots, its returns — are not called conditionally.
 */
function ReceiptBody({ receipt }: { receipt: Receipt }) {

  const status = receipt.status;
  const consignment = receipt.purchaseType === "konsinyasi";
  const anyReceived = receipt.items.some(
    (item) => (toMinor(item.receivedQty) ?? 0n) > 0n,
  );

  const batchIds = receipt.items
    .map((item) => item.batchId)
    .filter((id): id is string => id !== null);

  const lots = useReceiptLots(batchIds);
  const returns = useReceiptReturns(receipt._id);

  const taxMinor = toMinor(receipt.taxAmount) ?? 0n;
  const receivedGrand = sumDecimals([
    receipt.receivedTotal,
    receipt.receivedTax,
  ]);

  const fromInvoice = receipt.origin === "invoice";
  // Every receipt is final (16 October 2026, BO): no Sisa, no per-line status.
  const totalSpan = 7;



  return (
    <div className="flex flex-col gap-6">
      {/* THE NUMBER IS THE TITLE, the status beside it — as an invoice's page
          reads (15 October 2026, on request). */}
      <PageHeading
        crumbs={[
          PURCHASING_CRUMBS.hub,
          PURCHASING_CRUMBS.receipts,
          { label: receipt.receiptNumber },
        ]}
        title={receipt.receiptNumber}
        aside={<ReceiptStatusBadge status={status} />}
        actions={
          /* Consignment has nothing to return AGAINST, and nothing can go
             back before something arrived. */
          !consignment &&
          anyReceived && (
            <Can feature="purchaseReturns" action="create">
              <Button variant="secondary" asChild>
                <Link
                  href={`/dashboard/purchasing/returns/new?receipt=${receipt._id}`}
                >
                  Buat retur dari penerimaan ini
                </Link>
              </Button>
            </Can>
          )
        }
      >
        {receipt.supplierName ?? "Supplier terhapus"} ·{" "}
        {receipt.branchName ?? "—"} · {receipt.warehouseName ?? "—"}
      </PageHeading>

      <Card>
        {/* ONE GRID, the way an invoice's Rincian reads: every label above its
            value, columns that line up, and the invoice a link. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Supplier">{receipt.supplierName ?? "—"}</Field>
          {/* BRANCH BEFORE WAREHOUSE — widest scope first, the way the receipt
              form asks the same two questions. "—" for a delivery written
              before the branch was recorded. */}
          <Field label="Cabang">{receipt.branchName ?? "—"}</Field>
          <Field label="Gudang">{receipt.warehouseName ?? "—"}</Field>
          <Field label="Jenis">
            <SupplierTypeBadge type={receipt.purchaseType} />
          </Field>
          <Field label="Tanggal">
            <span className="tabular-nums">
              {formatDate(receipt.receiptDate)}
            </span>
          </Field>
          <Field label="Dicatat oleh">{receipt.createdByName ?? "—"}</Field>
          <Field label="Faktur pembelian">
            {receipt.invoiceId ? (
              <Link
                href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}
                className="font-semibold text-primary tabular-nums hover:underline"
              >
                {receipt.invoiceNumber ?? "Lihat faktur"} →
              </Link>
            ) : (
              <span className="text-muted">belum ada</span>
            )}
          </Field>
        </dl>
      </Card>

      {receipt.origin === "invoice" && (
        <Alert variant="info">
          Penerimaan ini dibuat dari faktur supplier dan tidak bisa diubah.
          Barang dari faktur yang sama yang datang belakangan dicatat sebagai
          penerimaan baru.
          {receipt.invoiceId && (
            <>
              {" "}
              <Link
                href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Lihat faktur
              </Link>
            </>
          )}
        </Alert>
      )}

      {status === "closed" && (
        <Alert variant="info">
          Penerimaan ditutup
          {receipt.closedAt ? ` pada ${formatDate(receipt.closedAt)}` : ""}
          {receipt.closedByName ? ` oleh ${receipt.closedByName}` : ""} — sisa
          barang yang tidak datang sudah dibatalkan
          {receipt.invoiceId ? " dan tagihan fakturnya ikut disesuaikan" : ""}.
        </Alert>
      )}


      {returns.length > 0 && (
        <Alert variant="info">
          Penerimaan ini sudah punya {returns.length} retur:{" "}
          {returns.map((row, index) => (
            <span key={row._id}>
              {index > 0 && ", "}
              <Link
                href={`/dashboard/purchasing/returns/${row._id}`}
                className="tabular-nums font-semibold text-primary-hover hover:underline"
              >
                {row.returnNumber}
              </Link>
              {row.status === "draft" && " (draft)"}
            </span>
          ))}
          . Periksa dulu sebelum membuat retur baru agar barang yang sama tidak
          dikembalikan dua kali.
        </Alert>
      )}

      <Card title="Barang">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="text-right">Dipesan</TableHead>
                <TableHead className="text-right">Diterima</TableHead>
                <TableHead className="text-right">Diretur</TableHead>
                <TableHead className="text-right">
                  {consignment ? "Harga setor" : "Harga beli"}
                </TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.items.map((item) => {
                const lot = item.batchId ? lots[item.batchId] : undefined;
                // `name` is the snapshot taken when the line was filed; shown
                // when the product has been renamed since.
                const renamed =
                  item.productName !== null && item.productName !== item.name;
                const returnedMinor = toMinor(item.returnedQty) ?? 0n;
                const expiry = lot?.expiryDate ?? item.expiryDate ?? null;

                return (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {item.productName ?? item.name}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        <SkuText value={item.productSku} fallback="—" />
                        {renamed && (
                          <span className="ml-1 italic">
                            · saat dicatat: {item.name}
                          </span>
                        )}
                      </p>
                    </TableCell>

                    <TableCell className="text-xs tabular-nums">
                      {item.batchId ? (
                        <>
                          {lot?.batchCode ?? "ada lot"}
                          {(lot?.supplierBatchCode ??
                            item.supplierBatchCode) && (
                            <span className="block text-muted">
                              supplier:{" "}
                              {lot?.supplierBatchCode ?? item.supplierBatchCode}
                            </span>
                          )}
                        </>
                      ) : item.supplierBatchCode ? (
                        <span className="text-muted">
                          supplier: {item.supplierBatchCode}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {expiry ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs tabular-nums">
                            {formatDate(expiry)}
                          </span>
                          {lot?.expiryDate && (
                            <ExpiryBadge date={lot.expiryDate} />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {/* The invoice line's qty on a receipt made from one. */}
                      {formatQty(
                        fromInvoice ? (item.orderedQty ?? item.qty) : item.qty,
                      )}
                      {item.productUnit && (
                        <span className="ml-1 text-muted">
                          {item.productUnit}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs font-semibold tabular-nums">
                      {formatQty(item.receivedQty)}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {returnedMinor > 0n ? (
                        <>
                          <span className="text-danger">
                            {formatQty(item.returnedQty)}
                          </span>
                          <span className="block text-xs text-muted">
                            sisa {formatQty(item.remainingQty)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(item.costPerUnit)}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(item.subtotal)}
                    </TableCell>
                  </TableRow>
                );
              })}

              <TotalRow
                span={totalSpan}
                // A receipt made from an invoice totals what arrived on it.
                label={fromInvoice ? "Subtotal" : "Subtotal (dipesan)"}
                value={receipt.total}
                strong
              />
              {taxMinor > 0n && (
                <TotalRow
                  span={totalSpan}
                  label="PPN masukan"
                  value={receipt.taxAmount}
                />
              )}
              <TotalRow
                span={totalSpan}
                label="Total"
                value={receipt.grandTotal}
                strong
              />
              <TotalRow
                span={totalSpan}
                label={
                  consignment
                    ? "Nilai barang yang sudah diterima"
                    : "Sudah diterima & tercatat sebagai utang (termasuk PPN)"
                }
                value={receivedGrand}
              />
            </TableBody>
          </Table>
        </div>
      </Card>

      {receipt.notes && (
        <Card title="Catatan">
          <p className="text-sm whitespace-pre-wrap">{receipt.notes}</p>
        </Card>
      )}

      {/* ------------------------------------------------- faktur & utang */}
      {consignment ? (
        <div className="rounded-xl bg-tint-warning px-4 py-3 text-sm text-foreground">
          <b>Konsinyasi — tidak ada jurnal saat barang diterima.</b> Barang yang
          sudah diterima masuk gudang dan bisa dijual, tapi masih milik supplier
          sampai laku. Utangnya baru muncul saat barang terjual, sebesar harga
          setor per unit, dan dilunasi lewat &quot;Setor&quot; di Ringkasan
          Pembelian.
        </div>
      ) : receipt.invoiceId ? null : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-neutral px-4 py-3 text-sm">
          <span>
            <b>Faktur supplier belum dicatat.</b> Utang tetap tercatat sebesar
            barang yang sudah diterima; faktur menambahkan nomor tagihan dan
            jatuh temponya. Barangnya akan disalin dari penerimaan ini.
          </span>
          <Can feature="purchaseInvoices" action="create">
            <Button variant="secondary" size="sm" asChild className="ml-auto">
              <Link
                href={`/dashboard/purchasing/payables/new?receipt=${receipt._id}`}
              >
                Catat faktur supplier
              </Link>
            </Button>
          </Can>
        </div>
      )}

      <PurchaseActivityCard kind="receipt" id={receipt._id} />
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  span = 9,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** The columns before Subtotal — fewer when Sisa and Status are hidden. */
  span?: number;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={span}
        className={cn(
          "text-right text-xs",
          strong ? "font-semibold" : "text-muted",
        )}
      >
        {label}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          strong ? "text-sm font-semibold" : "text-xs",
        )}
      >
        {formatMoney(value)}
      </TableCell>
    </TableRow>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}
