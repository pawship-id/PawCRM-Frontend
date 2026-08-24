"use client";

import Link from "next/link";

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
import { cn } from "@/lib/utils";
import type { StockEntryKind } from "@/types/inventory";
import { formatMoney, formatQty } from "@/utils/decimal";

import { useStockEntry } from "../hooks/useStockEntry";

/**
 * One hand-typed stock document, read.
 *
 * WHAT AN AUDIT COMES HERE FOR, in the order it asks: which document, when, at
 * which warehouse, why, by whom — then the lines, then what the ledger actually
 * did with them.
 *
 * THE MOVEMENT COUNT IS THE ONE FACT NO OTHER SCREEN SHOWS — and it is shown
 * only when it DIFFERS from the line count. A document names N products and may
 * have written more than N rows, because FEFO splits a withdrawal across every
 * lot it draws from; saying so is what stops the first reader who counts the
 * stock card reading it as a double posting. When the two agree it is the
 * ordinary case and says nothing, and two badges holding the same number is a
 * question a reader stops to answer and gets nothing for.
 *
 * NOTHING IS EDITABLE, and the screen says so rather than leaving somebody to
 * discover it: the document describes movements that cannot be unwritten, so a
 * mistake is answered by a second document rather than by changing this one.
 *
 * `systemQty` IS RENDERED FOR AN ADJUSTMENT AND NOT FOR AN OPENING BALANCE,
 * because on the latter it is null by definition — the system held nothing. A
 * column of dashes would be a column asking to be read.
 */
export function StockEntryDetail({
  id,
  kind,
}: {
  id: string;
  kind: StockEntryKind;
}) {
  const { entry, loading, error } = useStockEntry(id, kind);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat dokumen…
      </div>
    );
  }

  if (error || !entry) {
    return <Alert variant="error">{error ?? "Dokumen tidak ditemukan."}</Alert>;
  }

  const branch = typeof entry.branchId === "string" ? null : entry.branchId;
  const warehouse =
    typeof entry.warehouseId === "string" ? null : entry.warehouseId;
  const author =
    typeof entry.createdBy === "string" || entry.createdBy === null
      ? null
      : entry.createdBy;
  const isAdjustment = kind === "adjustment";
  const lines = entry.lines ?? [];
  const movementCount = entry.movementIds?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Nomor">
            <span className="tabular-nums">{entry.entryNumber}</span>
          </Field>
          {/* NAMED FOR WHAT IT DATES, not just "Tanggal" — the field beside it
              now carries a second date, and two fields called the same thing is
              how a reader stops trusting either. */}
          <Field
            label={isAdjustment ? "Tanggal penyesuaian" : "Tanggal stok awal"}
          >
            <span className="tabular-nums">{formatDate(entry.entryDate)}</span>
          </Field>
          <Field label="Cabang">{branch?.name ?? "—"}</Field>
          <Field label="Gudang">{warehouse?.name ?? "—"}</Field>
          {/* WHO AND WHEN AS ONE FACT. `entryDate` is the day the correction
              BELONGS to and `createdAt` is the day it was typed; they differ
              whenever anything is entered late, and that gap is the first thing
              an audit asks about. Shown ALWAYS rather than only when they
              differ — a reader must be able to SEE they agree, not infer it
              from a line that is missing. */}
          <Field label="Dibuat oleh">
            {author?.name ?? "—"}
            <span className="mt-0.5 block text-xs font-normal tabular-nums text-muted">
              {formatDateTime(entry.createdAt)}
            </span>
          </Field>
        </dl>

        {entry.notes && (
          <div className="mt-4 border-t border-border/60 pt-4">
            {/* "Catatan" ON BOTH KINDS — the same `notes` field, and what both
                forms actually ask their author for: a free note for whoever
                audits it later, not a reason off a list. */}
            <dt className="text-xs font-medium uppercase tracking-wider text-muted">
              Catatan
            </dt>
            <dd className="mt-1 text-[15px] text-foreground">{entry.notes}</dd>
          </div>
        )}
      </Card>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Produk
            <Badge variant="outline">{entry.lineCount} baris</Badge>
            {/* THE MOVEMENT COUNT ONLY APPEARS WHEN IT DIFFERS, because the
                difference IS the message: one product can become three rows on
                the stock card when FEFO draws it from three lots, and a reader
                who counts those rows without being told reads it as a double
                posting.

                Equal is the ordinary case and says nothing — two badges holding
                the same number is a question a reader stops to answer and gets
                nothing for. */}
            {movementCount !== entry.lineCount && (
              <Badge variant="outline">{movementCount} pergerakan</Badge>
            )}
          </span>
        }
        description={
          movementCount > entry.lineCount
            ? "Pergerakannya lebih banyak dari barisnya karena barang diambil dari beberapa batch sekaligus — satu baris kartu stok per batch."
            : undefined
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                {isAdjustment && (
                  <TableHead className="text-right">Stok sistem</TableHead>
                )}
                <TableHead className="text-right">
                  {isAdjustment ? "Selisih" : "Jumlah"}
                </TableHead>
                <TableHead className="text-right">Harga / unit</TableHead>
                <TableHead>Batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const decreasing = line.qty.trim().startsWith("-");

                return (
                  <TableRow key={`${line.productId}-${index}`}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {line.productName ?? "—"}
                      </p>
                      <p className="text-xs tabular-nums text-muted">
                        {line.productSku}
                        {line.productUnit && ` · ${line.productUnit}`}
                        {line.isConsignment && " · konsinyasi"}
                      </p>
                    </TableCell>

                    {isAdjustment && (
                      <TableCell className="text-right tabular-nums text-muted">
                        {line.systemQty === null
                          ? "—"
                          : formatQty(line.systemQty)}
                      </TableCell>
                    )}

                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        isAdjustment &&
                          (decreasing ? "text-danger" : "text-success"),
                      )}
                    >
                      {/* The sign is kept on an adjustment and dropped on an
                          opening balance, where every line is inbound and a `+`
                          on all of them would be decoration. */}
                      {isAdjustment && !decreasing && "+"}
                      {formatQty(line.qty)}
                    </TableCell>

                    {/* THE PRICE SOMEBODY NAMED, or the one the lot came in at
                        when they named a lot instead — and the cell says which.
                        Folding the two into one number would leave a reader
                        unable to tell a price typed on this document from a fact
                        about a batch that was already on the shelf. */}
                    <TableCell className="text-right tabular-nums text-muted">
                      {line.costPerUnit ? (
                        formatMoney(line.costPerUnit)
                      ) : line.batchCostPerUnit ? (
                        <>
                          {formatMoney(line.batchCostPerUnit)}
                          <span className="block text-xs">dari batch</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="text-muted">
                      {line.batchCode ?? "—"}
                      {line.supplierBatchCode && (
                        <span className="block text-xs tabular-nums">
                          supplier: {line.supplierBatchCode}
                        </span>
                      )}
                      {line.expiryDate && (
                        <span className="block text-xs tabular-nums">
                          exp {line.expiryDate.slice(0, 10)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        {entry.journalEntryId ? (
          <p className="text-sm text-muted">
            Jurnal yang terbentuk:{" "}
            <Link
              href={`/dashboard/keuangan/journal-entries/${entry.journalEntryId}`}
              className="font-medium text-primary hover:underline"
            >
              lihat di Jurnal Umum
            </Link>
          </p>
        ) : (
          /* Null is ordinary, not missing — goods with no cost basis move a
             quantity and not a value, and the ledger correctly declines to post
             an entry worth nothing. Said, so nobody hunts for a missing link. */
          <p className="text-sm text-muted">
            Tidak ada jurnal untuk dokumen ini — barangnya belum punya HPP, jadi
            yang berpindah baru kuantitasnya.
          </p>
        )}

        <p className="text-xs text-muted">
          Dokumen yang sudah tersimpan <b>tidak bisa diubah atau dihapus</b>.
          Kalau ada yang salah, koreksinya dengan membuat dokumen baru —
          sehingga kesalahan dan perbaikannya sama-sama tetap terlihat.
        </p>
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
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * "19 Agu 2026, 14.22" — the moment the row was written.
 *
 * SHORTER THAN THE DATE BESIDE IT, and carrying a time that one does not. Two
 * dates in one card have to be told apart at a glance, and the format is the
 * cheapest way to do it: the one a reader came for is the long one.
 *
 * The time earns its place here specifically — two documents typed the same day
 * are ordinary, and "which came first" is a question only it can answer.
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
