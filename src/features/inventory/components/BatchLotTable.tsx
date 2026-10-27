"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  DataTable,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, multiplyDecimals, toMinor } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

import { partitionBatches } from "../utils/ledger";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The lots of one product at one warehouse — by default in the order FEFO will
 * consume them.
 *
 * THE OTHER HALF OF THE STOCK CARD, not a separate report. The ledger says what
 * happened; the lots say what is on the shelf right now. Both are derived from
 * the same movements — a lot's `qtyRemaining` is a cache the ledger could
 * rebuild — so a disagreement between the two tabs is itself the useful signal,
 * and putting them a click apart is what lets anyone notice one.
 *
 * The API already returns them closest-to-expiring first, so the default order
 * re-sorts nothing by expiry. What it does do is float the LIVE lots above the
 * exhausted ones, which is a display choice: spent rows are history, not queue.
 *
 * SORTED FROM THE HEADERS, IN THE BROWSER (BO, 19 October 2026) — the one
 * inventory table that may, because it is not paged: every lot the card loaded
 * (up to 100) is already in memory, so a client sort orders the whole set rather
 * than one page of it. The FEFO NUMBER STAYS WITH ITS LOT: it is computed from
 * the FEFO order, never from the row's position, so re-sorting by value cannot
 * make lot #3 read as the next one to pick.
 */

/** The orderings this table offers. Local names — no API sees them. */
export type LotSort =
  | "fefo"
  | "fefoReversed"
  | "codeAsc"
  | "codeDesc"
  | "expiryAsc"
  | "expiryDesc"
  | "qtyAsc"
  | "qtyDesc"
  | "costAsc"
  | "costDesc"
  | "valueAsc"
  | "valueDesc";

const SORT_OPTIONS: SortOptions<LotSort> = {
  fefo: { asc: "fefo", desc: "fefoReversed" },
  code: { asc: "codeAsc", desc: "codeDesc" },
  expiry: { asc: "expiryAsc", desc: "expiryDesc" },
  qty: { asc: "qtyAsc", desc: "qtyDesc", first: "desc" },
  cost: { asc: "costAsc", desc: "costDesc", first: "desc" },
  value: { asc: "valueAsc", desc: "valueDesc", first: "desc" },
};

function remainingOf(batch: ProductBatch): bigint {
  return toMinor(batch.qtyRemaining) ?? 0n;
}

/** Remaining × cost in minor units squared — only ever compared, never shown. */
function valueOf(batch: ProductBatch): bigint {
  return remainingOf(batch) * (toMinor(batch.costPerUnit) ?? 0n);
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The rows in the order asked for. `fefoOrdered` is the default order (live in
 * FEFO order, then spent), and every other sort starts from it — `sort` is
 * stable, so ties keep their FEFO order.
 */
export function sortLots(fefoOrdered: ProductBatch[], sort: LotSort): ProductBatch[] {
  const rows = [...fefoOrdered];
  const by = (compare: (a: ProductBatch, b: ProductBatch) => number) =>
    rows.sort(compare);

  switch (sort) {
    case "fefo":
      return rows;
    case "fefoReversed":
      return rows.reverse();
    case "codeAsc":
    case "codeDesc": {
      const sign = sort === "codeAsc" ? 1 : -1;
      return by(
        (a, b) =>
          sign * a.batchCode.localeCompare(b.batchCode, "id", { numeric: true }),
      );
    }
    case "expiryAsc":
    case "expiryDesc": {
      const sign = sort === "expiryAsc" ? 1 : -1;
      // A lot with no expiry has no date to order by, so it goes LAST either
      // way — "tanpa expiry" is neither the soonest nor the latest.
      return by((a, b) => {
        if (!a.expiryDate || !b.expiryDate) {
          return Number(!a.expiryDate) - Number(!b.expiryDate);
        }
        return sign * (Date.parse(a.expiryDate) - Date.parse(b.expiryDate));
      });
    }
    case "qtyAsc":
    case "qtyDesc": {
      const sign = sort === "qtyAsc" ? 1 : -1;
      return by((a, b) => sign * compareBigint(remainingOf(a), remainingOf(b)));
    }
    case "costAsc":
    case "costDesc": {
      const sign = sort === "costAsc" ? 1 : -1;
      return by(
        (a, b) =>
          sign *
          compareBigint(
            toMinor(a.costPerUnit) ?? 0n,
            toMinor(b.costPerUnit) ?? 0n,
          ),
      );
    }
    case "valueAsc":
    case "valueDesc": {
      const sign = sort === "valueAsc" ? 1 : -1;
      return by((a, b) => sign * compareBigint(valueOf(a), valueOf(b)));
    }
  }
}

function lotColumns(
  orderOf: Map<string, number>,
  withDetail: boolean,
): DataTableColumn<ProductBatch>[] {
  const columns: DataTableColumn<ProductBatch>[] = [
    {
      id: "fefo",
      header: "Urutan FEFO",
      cell: (batch) => {
        const order = orderOf.get(batch._id);
        return order ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 tabular-nums text-xs font-semibold text-primary-hover">
            {order}
          </span>
        ) : (
          <span className="text-xs text-muted">
            {remainingOf(batch) < 0n ? "minus" : "habis"}
          </span>
        );
      },
    },
    {
      id: "code",
      header: "Kode batch internal",
      cell: (batch) => (
        <>
          <span className="tabular-nums text-xs">{batch.batchCode}</span>
          {batch.isConsignment && (
            <Badge
              variant="outline"
              className="ml-2 border-transparent bg-secondary/25 text-secondary-foreground"
            >
              konsinyasi
            </Badge>
          )}
        </>
      ),
    },
    {
      id: "expiry",
      header: "Kedaluwarsa",
      cell: (batch) =>
        batch.expiryDate ? (
          <ExpiryBadge date={batch.expiryDate} />
        ) : (
          <span className="text-xs text-muted">tanpa kedaluwarsa</span>
        ),
    },
    {
      id: "qty",
      header: "Sisa stok",
      align: "right",
      cellClassName: (batch) =>
        cn("text-sm", remainingOf(batch) < 0n && "font-semibold text-danger"),
      cell: (batch) => formatQty(batch.qtyRemaining),
    },
    {
      id: "cost",
      header: "Harga beli batch",
      align: "right",
      cellClassName: "text-xs text-muted",
      cell: (batch) => formatMoney(batch.costPerUnit),
    },
    {
      id: "value",
      header: "Nilai sisa",
      align: "right",
      cellClassName: "text-xs",
      cell: (batch) =>
        remainingOf(batch) === 0n
          ? "—"
          : formatMoney(multiplyDecimals(batch.qtyRemaining, batch.costPerUnit)),
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

export function BatchLotTable({
  batches,
  total,
  hasExpiry,
  search = "",
  onSelect,
}: {
  batches: ProductBatch[];
  /** How many lots exist server-side — larger than the array means it was cut. */
  total: number;
  hasExpiry: boolean;
  /**
   * The search the page is under, for the empty state to name.
   *
   * The two tabs share one box but not one match: the ledger matches a note OR
   * a lot code, this list matches the CODE only. So a word from a note empties
   * this tab truthfully, and without saying why it reads as "this product has
   * no lots" — which is a different, alarming claim.
   */
  search?: string;
  /** A row was opened — the card shows the lot's detail. Rows are plain when absent. */
  onSelect?: (batch: ProductBatch) => void;
}) {
  const searching = search.trim() !== "";
  const [sort, setSort] = useState<LotSort>("fefo");

  /**
   * The FEFO order and each live lot's place in it, computed once per load —
   * the number is the lot's, so it is looked up by id, not by row position.
   */
  const { fefoOrdered, orderOf } = useMemo(() => {
    const { live, spent } = partitionBatches(batches);
    return {
      fefoOrdered: [...live, ...spent],
      orderOf: new Map(live.map((batch, index) => [batch._id, index + 1])),
    };
  }, [batches]);

  const rows = useMemo(() => sortLots(fefoOrdered, sort), [fefoOrdered, sort]);

  return (
    <DataTable
      columns={lotColumns(orderOf, Boolean(onSelect))}
      rows={rows}
      rowKey={(batch) => batch._id}
      sort={{ value: sort, options: SORT_OPTIONS, onChange: setSort }}
      rowClassName={(batch) => remainingOf(batch) === 0n && "opacity-55"}
      onRowClick={onSelect}
      empty={
        <div className="py-16 text-center">
          <p className="font-medium text-foreground">
            {searching
              ? `Tidak ada batch dengan kode "${search.trim()}"`
              : "Tidak ada batch di gudang ini"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {searching
              ? "Kotak pencarian di atas mencocokkan kode batch di tab ini, dan catatan maupun kode batch di tab Pergerakan — jadi kata yang cuma ada di catatan akan mengosongkan daftar ini."
              : hasExpiry
                ? "Batch dibuat otomatis saat barang diterima."
                : "Batch hanya dibuat untuk barang yang punya masa kedaluwarsa atau datang sebagai konsinyasi — produk ini tidak melacak batch."}
          </p>
        </div>
      }
      note={
        batches.length > 0 && batches.length < total ? (
          <p>
            Menampilkan {batches.length} batch pertama dari {total} —
            pengurutan kolom berlaku untuk batch yang tampil.
          </p>
        ) : undefined
      }
    />
  );
}
