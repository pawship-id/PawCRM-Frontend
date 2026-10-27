"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Printer } from "lucide-react";

import { SkuText } from "@/components/SkuText";
import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
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
import { stockTransferService } from "@/services/stockTransfer.service";
import {
  absDecimal,
  formatMoney,
  formatQty,
  multiplyDecimals,
  sumDecimals,
} from "@/utils/decimal";

import { useStockTransfer } from "../hooks/useStockTransfer";
import { transferFailureMessage } from "../utils/transferErrors";
import { StockTransferStatusBadge } from "./StockTransferStatusBadge";

/**
 * One transfer, read — what was sent, from where to where, whether it has
 * arrived, and what it was worth. It is also where a transfer is received,
 * corrected, cancelled and printed.
 *
 * THE ACTIONS FOLLOW THE STATUS, and only an in-transit transfer has any beyond
 * the print:
 *
 *   Ubah             — while the goods are on the road. A correction.
 *   Terima barang    — the goods have landed; the destination's stock goes up.
 *   Batalkan transfer — the goods go back to the shelf they left.
 *   Cetak surat jalan — always. A copy is wanted after the fact as often as
 *                       before it: the driver lost one, or an auditor asks.
 *
 * Received and cancelled transfers show none of the first three, and say why —
 * a button that is simply absent leaves somebody wondering whether they have
 * lost a permission.
 *
 * THE VALUE LIVES HERE, NOT IN THE LIST. A transfer's worth is the sum of a
 * dozen products at their own averages, and a single figure in a table column
 * says nothing a reader can act on: it cannot be checked, and it cannot be
 * traced to a product without opening the row anyway.
 *
 * THE TABLE IS PER LOT, the surat jalan is per product. What FEFO drew is what
 * left the shelf, and a product that came off three shelves is three rows here;
 * the printed note lists what was ASKED FOR, one line each, because that is what
 * somebody counts boxes against.
 *
 * VALUED AT `hppAtTime`, the average the ledger used at the moment of the move —
 * not at today's. A transfer posts no journal entry, so this is an informational
 * figure rather than an accounting one, and it is the same number the stock card
 * shows for the same row.
 */
export function StockTransferDetail({ transferId }: { transferId: string }) {
  const { transfer, loading, error, notFound, setTransfer, refetch } =
    useStockTransfer(transferId);

  /** Which confirmation is open — at most one. */
  const [confirming, setConfirming] = useState<"receive" | "cancel" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat transfer…
      </div>
    );
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (notFound || !transfer) {
    return (
      <Alert variant="error">
        Transfer ini tidak ditemukan, atau bukan milik toko Anda.
      </Alert>
    );
  }

  const { lines, arrivals } = transfer;
  const inTransit = transfer.status === "in_transit";

  /**
   * THE LOTS THAT NOW SIT AT THE DESTINATION, for reprinting their labels.
   *
   * A transfer re-creates each lot at the far warehouse, and batch codes are
   * unique within the tenant — so the arriving row cannot carry the source's
   * code and is minted its own. That makes RELABELLING part of the move rather
   * than an afterthought: the sticker on the carton names a lot at the warehouse
   * it just left, and a till at the destination scanning it would resolve to the
   * wrong shelf.
   */
  const arrivedLotIds = arrivals
    .filter((movement) => movement.batchId !== null)
    .map((movement) => movement.batchId as string);

  const lineValue = (movement: (typeof lines)[number]) =>
    movement.hppAtTime
      ? multiplyDecimals(absDecimal(movement.qty), movement.hppAtTime)
      : "0";
  const total = sumDecimals(lines.map(lineValue));

  async function act(kind: "receive" | "cancel") {
    setBusy(true);

    try {
      const updated =
        kind === "receive"
          ? await stockTransferService.receive(transferId)
          : await stockTransferService.cancel(transferId);

      setTransfer(updated);
      setConfirming(null);
      swalToast(
        kind === "receive"
          ? `${updated.transferNumber} diterima — stok ${updated.toWarehouseName ?? "gudang tujuan"} bertambah.`
          : `${updated.transferNumber} dibatalkan — barang kembali ke ${updated.fromWarehouseName ?? "gudang asal"}.`,
      );
    } catch (err) {
      /*
        A FAILED ACT IS A TOAST (ui-rules §9) — the screen behind it is intact
        and still the thing to read. The dialog closes so the reason is not
        hidden behind it; a 409 usually means somebody else got there first, and
        the page is reloaded to show what they did.
      */
      setConfirming(null);
      swalToast(
        transferFailureMessage(err, kind === "receive" ? "terima" : "batal"),
        "error",
        6000,
      );
      // The server may have finished after the browser stopped waiting — the
      // page reloads so it shows what actually happened rather than the state
      // from before the click.
      if (err instanceof ApiError && err.isTimeout) {
        refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {confirming === "receive" && (
        <ConfirmDialog
          title="Terima barang ini?"
          confirmLabel="Terima barang"
          busy={busy}
          onConfirm={() => act("receive")}
          onCancel={() => setConfirming(null)}
        >
          Stok {transfer.toWarehouseName ?? "gudang tujuan"} bertambah sesuai
          barang di bawah. Setelah diterima, transfer tidak bisa diubah lagi —
          kekeliruan dikoreksi dengan transfer balik.
        </ConfirmDialog>
      )}

      {confirming === "cancel" && (
        <ConfirmDialog
          title="Batalkan transfer ini?"
          confirmLabel="Batalkan transfer"
          destructive
          busy={busy}
          onConfirm={() => act("cancel")}
          onCancel={() => setConfirming(null)}
        >
          Semua barang dikembalikan ke {transfer.fromWarehouseName ?? "gudang asal"}
          {" "}dan transfer ini tidak bisa dilanjutkan. Dokumennya tetap tersimpan
          sebagai riwayat.
        </ConfirmDialog>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StockTransferStatusBadge status={transfer.status} />
          {transfer.revision > 0 && (
            <span className="text-sm text-muted">
              Direvisi {transfer.revision}×
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href={`/dashboard/inventory/transfers/${transfer._id}/print`}>
              <Printer className="size-4" />
              Cetak surat jalan
            </Link>
          </Button>

          {inTransit && (
            <Can feature="stockTransfers" action="create">
              <Button variant="secondary" asChild>
                <Link
                  href={`/dashboard/inventory/transfers/${transfer._id}/edit`}
                >
                  <Pencil className="size-4" />
                  Ubah
                </Link>
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirming("cancel")}
              >
                Batalkan transfer
              </Button>
              <Button onClick={() => setConfirming("receive")}>
                Terima barang
              </Button>
            </Can>
          )}
        </div>
      </div>

      {/* SAID, because it is the one consequence of this state people do not
          expect: the goods have already left the source, so its stock has gone
          down, and nothing has arrived yet — the destination's stock does not
          move until somebody there presses Terima. */}
      {inTransit && (
        <Alert variant="info">
          Barang sudah keluar dari <b>{transfer.fromWarehouseName ?? "gudang asal"}</b>{" "}
          dan belum tercatat di <b>{transfer.toWarehouseName ?? "gudang tujuan"}</b>.
          Stok gudang tujuan bertambah setelah transfer diterima. Selama belum
          diterima, transfer masih bisa diubah atau dibatalkan.
        </Alert>
      )}

      {transfer.status === "cancelled" && (
        <Alert variant="warning">
          Transfer ini dibatalkan
          {transfer.cancelledAt && ` pada ${formatDateTime(transfer.cancelledAt)}`}
          {transfer.cancelledByName && ` oleh ${transfer.cancelledByName}`}.
          Barangnya sudah kembali ke {transfer.fromWarehouseName ?? "gudang asal"}.
        </Alert>
      )}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="No. transfer">
            <span className="tabular-nums">{transfer.transferNumber}</span>
          </Field>
          {/* NAMED FOR WHAT IT DATES: the date the goods were SENT. The author
              line below carries a second timestamp, and two fields both called
              "Tanggal" is how a reader stops trusting either. */}
          <Field label="Tanggal transfer">
            <span className="tabular-nums">
              {formatDate(transfer.transferDate)}
            </span>
          </Field>
          <Field label="Dari">{transfer.fromWarehouseName ?? "—"}</Field>
          <Field label="Ke">{transfer.toWarehouseName ?? "—"}</Field>
          <Field label="Dibuat oleh">
            {transfer.createdByName ?? "—"}
            <span className="mt-0.5 block text-xs font-normal tabular-nums text-muted">
              {formatDateTime(transfer.createdAt)}
            </span>
          </Field>
          {transfer.status === "received" && (
            <Field label="Diterima oleh">
              {transfer.receivedByName ?? "—"}
              {transfer.receivedAt && (
                <span className="mt-0.5 block text-xs font-normal tabular-nums text-muted">
                  {formatDateTime(transfer.receivedAt)}
                </span>
              )}
            </Field>
          )}
        </dl>

        {transfer.notes && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <dt className="text-xs font-medium tracking-wider text-muted uppercase">
              Catatan
            </dt>
            <dd className="mt-1 text-[15px] text-foreground">
              {transfer.notes}
            </dd>
          </div>
        )}
      </Card>

      {arrivedLotIds.length > 0 && (
        <Alert variant="info">
          <p>
            Batch di gudang tujuan punya <b>kode baru</b> — kode batch unik per
            lot, jadi lot yang datang tidak bisa memakai kode yang sama dengan
            asalnya. Tempel ulang labelnya sebelum barang masuk rak.{" "}
            <Link
              href={`/dashboard/inventory/batches/labels?ids=${arrivedLotIds.join(",")}`}
              className="font-medium underline"
            >
              Cetak label gudang tujuan →
            </Link>
          </p>
        </Alert>
      )}

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Barang yang dipindahkan
            <Badge variant="outline">{transfer.productCount} produk</Badge>
            <Badge variant="outline">{lines.length} baris batch</Badge>
          </span>
        }
        description="Satu baris per batch yang diambil — barang yang tersebar di beberapa batch keluar sebagai beberapa baris."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">HPP / unit</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((movement) => (
                <TableRow key={movement._id}>
                  <TableCell>
                    <p className="font-medium text-foreground">
                      {movement.productName ?? "—"}
                    </p>
                    <p className="text-xs tabular-nums text-muted">
                      <SkuText value={movement.productSku} />
                      {movement.productUnit && ` · ${movement.productUnit}`}
                    </p>
                    {movement.lineNotes && (
                      <p className="mt-1 text-xs text-muted">
                        {movement.lineNotes}
                      </p>
                    )}
                  </TableCell>

                  {/* THE CODE AT EACH END IS A DIFFERENT CODE, and this is the
                      one screen where that has to be visible: the arriving row
                      is minted its own, so the carton is RELABELLED when it
                      lands. The supplier's number is the half that does NOT
                      change — it names the factory batch. */}
                  <TableCell className="text-muted">
                    {movement.batchCode ?? "—"}
                    {movement.supplierBatchCode && (
                      <span className="block text-xs tabular-nums">
                        supplier: {movement.supplierBatchCode}
                      </span>
                    )}
                    {movement.batchExpiryDate && (
                      <span className="block text-xs tabular-nums">
                        exp {movement.batchExpiryDate.slice(0, 10)}
                      </span>
                    )}
                  </TableCell>

                  {/* The magnitude, not the sign: the row is negative because
                      the goods left the source, and a column of minuses on a
                      screen titled "what was moved" reads as a shortage. */}
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQty(absDecimal(movement.qty))}
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-muted">
                    {movement.hppAtTime ? formatMoney(movement.hppAtTime) : "—"}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {formatMoney(lineValue(movement))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
          <span className="text-sm text-muted">Total nilai yang berpindah</span>
          <span className="text-base font-bold tabular-nums text-foreground">
            {formatMoney(total)}
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/inventory/stock-card?warehouseId=${transfer.fromWarehouseId}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Kartu stok gudang asal
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
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
    <div>
      <dt className="text-xs font-medium tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * "19 Agu 2026 09.00" — shorter than the date beside it, and carrying a time
 * that one does not.
 *
 * Two dates in one card have to be told apart at a glance, and the format is the
 * cheapest way to do it: the one a reader came for is the long one.
 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "19 Agustus 2026" — a detail screen has room for the full month. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
