"use client";

import { ChevronRight } from "lucide-react";

import {
  DataTable,
  Pagination,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type {
  MovementSort,
  ReferenceType,
  StockMovement,
} from "@/types/inventory";

import { MovementBadge } from "./MovementBadge";

/**
 * The stock card itself: every movement of one product at one warehouse, with
 * the balance each one left behind.
 *
 * NEWEST FIRST IS THE DEFAULT, and the reason it is: a stock card is read
 * top-down to answer "how did we get to this number", so the first row should
 * carry the current balance. Every other ordering is ON REQUEST, from the column
 * headers (BO, 19 October 2026) — and served by the server, since the ledger is
 * paged. The opening-balance footer appears only under the two CHRONOLOGICAL
 * orders: "saldo awal plus every row equals the last balance" holds only when
 * the rows run in time order, and the server sends no opening balance otherwise.
 *
 * EVERY COLUMN NOW COMES FROM THE ROW. This table used to derive its balance
 * from a quantity fetched elsewhere, join its lot codes from the batch tab's
 * data, and have no author column at all, because the API returned ids and no
 * balance. It returns both (PawCRM-Backend 0.20.0), so this component renders
 * and computes nothing.
 *
 * **Referensi** NAMES THE DOCUMENT WHERE THERE IS ONE TO NAME. A row posted by a
 * stock opname shows that sheet's number (`referenceNo`, PawCRM-Backend 0.24.0)
 * above its type; every other kind still shows the type alone, because
 * `goodsreceipts` and `postransactions` are not collections yet and a manual
 * adjustment has no document at all. The fallback is the TYPE, never
 * `reference.id` — an ObjectId names nothing a human can look up.
 */
/**
 * The label for a reference type, falling back to the raw value.
 *
 * Unlike `MovementBadge`, an unknown type here renders as NOTHING rather than
 * throwing — React drops `undefined` silently. That is quieter and worse: the
 * cell that says which document took the goods simply goes blank, and a reader
 * has no way to tell an unfamiliar type from a row that genuinely has no
 * reference. The backend's `REFERENCE_TYPES` and this file's list are two lists
 * nothing checks, so this WILL happen again the next module that ships one.
 */
function referenceLabel(type: ReferenceType): string {
  return REFERENCE_LABELS[type] ?? type;
}

const REFERENCE_LABELS: Record<ReferenceType, string> = {
  goods_receipt: "Penerimaan barang",
  pos_transaction: "Transaksi POS",
  // Named apart from the till's sale for the same reason `pos_void` is: a stock
  // card is read to find WHICH document took the goods, and "Transaksi POS" on a
  // row raised by an invoice would send somebody looking through the till's
  // history for a sale that was never rung up.
  customer_invoice: "Faktur penjualan",
  // Separately findable from the invoice itself, like `pos_void`: a stock card
  // shows the issue and the row unwinding it as two events, not one document
  // appearing twice.
  customer_invoice_void: "Pembatalan faktur",
  // "Pembatalan", not "Transaksi POS": the two are separately findable on
  // purpose, so a stock card shows the sale and the row unwinding it as two
  // events rather than one document appearing twice.
  pos_void: "Pembatalan transaksi",
  stock_opname: "Stok opname",
  purchase_return: "Retur pembelian",
  customer_return: "Retur customer",
  // The goods leaving. The two below are the same transfer's later acts, and
  // each is a row of its own so a card shows "sent", "received" and "undone" as
  // three events rather than one document appearing three times.
  transfer_manual: "Transfer stok",
  transfer_receive: "Penerimaan transfer",
  transfer_cancel: "Pembatalan transfer",
  bundle_consume: "Penjualan bundle",
  manual_adjustment: "Penyesuaian manual",
  // Has no document either, like a manual adjustment — but is worth naming
  // apart, because "what did this tenant start with" is a question the stock
  // card could not answer while the two shared one label.
  opening_balance: "Saldo awal persediaan",
};

/**
 * Column → the API's orderings (MOVEMENT_SORTS). Referensi is deliberately
 * plain: its label is assembled from several document collections, so any field
 * the server could sort would order the rows by something other than the text.
 * Tipe, Masuk / keluar and Diinput oleh are plain on BO's call (19 October
 * 2026). Saldo is valid only for one product at one warehouse — which a card
 * always is.
 */
const SORT_OPTIONS: SortOptions<MovementSort> = {
  time: { asc: "oldest", desc: "newest", first: "desc" },
  batch: { asc: "batchAsc", desc: "batchDesc" },
  balance: { asc: "balanceAsc", desc: "balanceDesc", first: "desc" },
  hpp: { asc: "hppAsc", desc: "hppDesc", first: "desc" },
};

/** The two orderings a running balance can be read down — see the header. */
function isChronological(sort: MovementSort): boolean {
  return sort === "newest" || sort === "oldest";
}

function ledgerColumns(
  unit: string,
  withDetail: boolean,
): DataTableColumn<StockMovement>[] {
  const columns: DataTableColumn<StockMovement>[] = [
    {
      id: "time",
      header: "Waktu",
      cellClassName: "tabular-nums text-xs text-muted",
      cell: (movement) =>
        new Date(movement.createdAt).toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      id: "type",
      header: "Tipe",
      cell: (movement) => <MovementBadge type={movement.movementType} />,
    },
    {
      id: "batch",
      header: "Kode batch internal",
      cellClassName: "tabular-nums text-xs text-muted",
      // A movement CAN legitimately have no lot: most stock is not
      // batch-tracked at all.
      cell: (movement) => movement.batchCode ?? "—",
    },
    {
      id: "qty",
      header: "Masuk / keluar",
      align: "right",
      cellClassName: (movement) =>
        cn(
          "text-sm font-semibold",
          isPositive(movement) ? "text-success" : "text-danger",
        ),
      cell: (movement) => (
        <>
          {isPositive(movement) ? "+" : ""}
          {formatQty(movement.qty)}
        </>
      ),
    },
    {
      id: "balance",
      header: "Saldo",
      align: "right",
      cellClassName: "text-sm",
      cell: (movement) => (
        <>
          {formatQty(movement.balanceAfter)}{" "}
          <span className="text-xs text-muted">{unit}</span>
        </>
      ),
    },
    {
      id: "hpp",
      header: "HPP saat itu",
      align: "right",
      cellClassName: "text-xs text-muted",
      cell: (movement) =>
        movement.hppAtTime ? formatMoney(movement.hppAtTime) : "—",
    },
    {
      id: "reference",
      header: "Referensi",
      // Room for a document number and its type on one line each (BO, 19
      // October 2026); a narrow screen scrolls the frame instead.
      cellClassName: "min-w-[16rem] whitespace-normal text-xs text-muted",
      cell: (movement) => (
        <>
          {movement.referenceNo ? (
            <>
              <span className="block tabular-nums text-foreground">
                {movement.referenceNo}
              </span>
              <span className="block text-[11px]">
                {referenceLabel(movement.reference.type)}
              </span>
            </>
          ) : (
            referenceLabel(movement.reference.type)
          )}

          {/* WHY it happened, which no other column can say — and the only
              thing a `manual_adjustment` or a `transfer_manual` has instead of
              a document number.

              Under the reference rather than in a column of its own: this
              table is already eight columns wide, and a note is read when a
              row looks surprising, not scanned down. Both levels are shown —
              the transfer's own reason and the product line's — because they
              answer different questions and either may be absent. */}
          {(movement.notes || movement.lineNotes) && (
            <span className="mt-1 block max-w-56 text-[11px] italic">
              {[movement.notes, movement.lineNotes].filter(Boolean).join(" · ")}
            </span>
          )}
        </>
      ),
    },
    {
      id: "createdBy",
      header: "Diinput oleh",
      cellClassName: "text-xs text-muted",
      // Null for movements a background process posted — the POS sync, an
      // opname's own difference rows.
      cell: (movement) => movement.createdByName ?? "sistem",
    },
  ];

  if (withDetail) {
    columns.push({
      id: "detail",
      header: <span className="sr-only">Detail</span>,
      headClassName: "w-8",
      cellClassName: "text-muted",
      cell: () => <ChevronRight aria-hidden className="size-4" />,
    });
  }

  return columns;
}

function isPositive(movement: StockMovement): boolean {
  return (toMinor(movement.qty) ?? 0n) > 0n;
}

export function StockLedgerTable({
  movements,
  unit,
  openingBalance,
  sort,
  onSortChange,
  loading = false,
  page,
  totalPages,
  total,
  filtered,
  onPageChange,
  onSelect,
}: {
  movements: StockMovement[];
  unit: string;
  /** The balance before the oldest row on this page, or null when unanswerable. */
  openingBalance: string | null;
  /** The ordering the page is in — a header click asks for another. */
  sort: MovementSort;
  onSortChange: (sort: MovementSort) => void;
  /** A page is on its way: rows on screen dim, an empty table shows a spinner. */
  loading?: boolean;
  page: number;
  totalPages: number;
  total: number;
  /** True when a type or date filter is narrowing the list — changes the empty copy. */
  filtered: boolean;
  onPageChange: (page: number) => void;
  /** A row was opened — the card shows its detail. Rows are plain when absent. */
  onSelect?: (movement: StockMovement) => void;
}) {
  const columns = ledgerColumns(unit, Boolean(onSelect));
  // The server already sends null for any other ordering; checked here too so a
  // re-sort hides the footer at once instead of keeping the last page's figure
  // under rows it no longer describes while the new page loads.
  //
  // ONLY WHEN THE CARD SPANS PAGES (BO, 19 October 2026). On a single page the
  // figure is the balance before the product's very first movement — almost
  // always 0, and a line that reads as noise. It earns its place on page 2 on.
  const opening =
    isChronological(sort) && totalPages > 1 ? openingBalance : null;

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={movements}
        rowKey={(movement) => movement._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat kartu stok…"
        tableClassName="min-w-[64rem]"
        onRowClick={onSelect}
        empty={
          <div className="py-16 text-center">
            <p className="font-medium text-foreground">
              {filtered
                ? "Tidak ada pergerakan yang cocok"
                : "Belum ada pergerakan"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {filtered
                ? "Coba longgarkan filter tipe atau rentang tanggalnya."
                : "Kartu stok terisi setelah ada penerimaan, penjualan, penyesuaian, atau transfer di gudang ini."}
            </p>
          </div>
        }
        footer={
          opening !== null && movements.length > 0 ? (
            <TableRow className="text-xs hover:bg-transparent">
              <TableCell className="text-muted" colSpan={4}>
                {/* The page's OLDEST row is its last under newest-first and its
                    first under oldest-first — the label follows. */}
                {sort === "newest"
                  ? "Saldo sebelum baris terakhir di halaman ini"
                  : "Saldo sebelum baris pertama di halaman ini"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQty(opening)}{" "}
                <span className="text-muted">{unit}</span>
              </TableCell>
              <TableCell colSpan={columns.length - 5} />
            </TableRow>
          ) : undefined
        }
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        unit="pergerakan"
        unitPlural="pergerakan"
        onPageChange={onPageChange}
      />
    </div>
  );
}
