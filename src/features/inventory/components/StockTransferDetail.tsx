"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  absDecimal,
  formatMoney,
  formatQty,
  multiplyDecimals,
  sumDecimals,
} from "@/utils/decimal";

import { useTransfer } from "../hooks/useTransfer";

/**
 * One transfer, read — what was moved, from where to where, and what it was
 * worth.
 *
 * THE VALUE LIVES HERE, NOT IN THE LIST. A transfer's worth is the sum of a
 * dozen products at their own averages, and a single figure in a table column
 * says nothing a reader can act on: it cannot be checked, and it cannot be
 * traced to a product without opening the row anyway. On the detail each line
 * carries its own quantity, its own cost and its own value, and the total is
 * something a reader arrives at rather than something they are handed.
 *
 * THERE IS NO TRANSFER DOCUMENT to read from. No collection, no number: the rows
 * are tied together by the correlation id the ledger stamps on every row of one
 * posting, and this screen asks for exactly that set. The header is therefore
 * assembled from the rows themselves — they all share a date, a source, a
 * destination and a note, because one posting wrote them together.
 *
 * ONE SIDE OF THE PAIR IS RENDERED. Every product moved wrote a `transfer_out`
 * and a mirroring `transfer_in`; listing both would show every product twice and
 * read as double the goods. What is on screen is what LEFT, which is also the
 * side that names the lot it came from.
 *
 * VALUED AT `hppAtTime`, the average the ledger used at the moment of the move —
 * not at today's. A transfer posts no journal entry, so this is an informational
 * figure rather than an accounting one, and it is the same number the stock card
 * shows for the same row.
 */
export function StockTransferDetail({ transferId }: { transferId: string }) {
  const { out, all, loading, error } = useTransfer(transferId);

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

  if (out.length === 0) {
    return (
      <Alert variant="error">
        Transfer ini tidak ditemukan, atau barisnya sudah tidak ada.
      </Alert>
    );
  }

  // Every row of one posting shares these, because one posting wrote them.
  const first = out[0];
  const lineValue = (movement: (typeof out)[number]) =>
    movement.hppAtTime
      ? multiplyDecimals(absDecimal(movement.qty), movement.hppAtTime)
      : "0";
  const total = sumDecimals(out.map(lineValue));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tanggal">
            <span className="tabular-nums">{formatDate(first.createdAt)}</span>
          </Field>
          <Field label="Dari">{first.warehouseName ?? "—"}</Field>
          <Field label="Ke">{first.destinationWarehouseName ?? "—"}</Field>
          <Field label="Oleh">{first.createdByName ?? "—"}</Field>
        </dl>

        {first.notes && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <dt className="text-xs font-medium tracking-wider text-muted uppercase">
              Catatan
            </dt>
            <dd className="mt-1 text-[15px] text-foreground">{first.notes}</dd>
          </div>
        )}
      </Card>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Barang yang dipindahkan
            <Badge variant="outline">{out.length} baris</Badge>
            {/* Both halves of the pair, so the stock card's row count adds up. */}
            <Badge variant="outline">{all.length} pergerakan</Badge>
          </span>
        }
        description="Satu baris per lot yang diambil — barang yang tersebar di beberapa batch keluar sebagai beberapa baris, dan tiap baris punya pasangannya di gudang tujuan."
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
              {out.map((movement) => (
                <TableRow key={movement._id}>
                  <TableCell>
                    <p className="font-medium text-foreground">
                      {movement.productName ?? "—"}
                    </p>
                    <p className="text-xs tabular-nums text-muted">
                      {movement.productSku}
                      {movement.productUnit && ` · ${movement.productUnit}`}
                    </p>
                    {movement.lineNotes && (
                      <p className="mt-1 text-xs text-muted">
                        {movement.lineNotes}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="text-muted">
                    {movement.batchCode ?? "—"}
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
        {/* A transfer moves goods between two warehouses of one tenant, so total
            inventory value does not change and there is nothing for double entry
            to record. Said out loud, because a document with a value on it that
            appears in no report is otherwise a gap somebody goes looking for. */}
        <p className="text-sm text-muted">
          Transfer <b>tidak membuat jurnal</b> — barang pindah antar gudang
          milik sendiri, jadi total nilai persediaan tidak berubah. Nilai di
          atas memakai HPP saat perpindahan, sebagai keterangan, bukan
          pembukuan.
        </p>

        <p className="text-xs text-muted">
          Kartu stok bersifat <b>append-only</b>. Transfer yang salah dikoreksi
          dengan transfer balik, bukan dengan mengubah baris ini.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={`/dashboard/inventory/stock-card?warehouseId=${first.warehouseId}`}
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

/** "19 Agustus 2026" — a detail screen has room for the full month. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
