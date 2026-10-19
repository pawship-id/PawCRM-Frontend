"use client";

import { SKU_WRAP_WIDE_CLASS } from "@/lib/sku";
import { Printer } from "lucide-react";

import {
  DataTable,
  HighlightText,
  Pagination,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  toMinor,
} from "@/utils/decimal";
import type { BatchSort, ProductBatch } from "@/types/inventory";

import { ExpiryBadge } from "./ExpiryBadge";
import { RowLinkMenu } from "./RowLinkMenu";

/**
 * Every lot the current filters match, in the order the API returns them.
 *
 * SORTED FROM THE HEADERS, BY THE SERVER (BO, 19 October 2026). The default is
 * closest-to-expiring first with the no-expiry lots last — the pick order. A
 * header click asks the API for another of BATCH_SORTS and re-fetches; nothing
 * is re-sorted here, because with the rows paged a client that re-sorted would
 * only reorder the twenty it holds, a sequence that changes meaning at every
 * page boundary.
 *
 * The product and warehouse names arrive ON THE ROW. This screen spans the whole
 * catalogue, so a client resolving them itself would need all of it in memory,
 * and one holding part of it would render blanks for the rest.
 *
 * THE BRANCH DOES NOT, and cannot: a lot has no branch of its own — it belongs to
 * a warehouse, and the warehouse carries the link. The screen holds both lookups
 * whole and hands the walk down as `branchOf`.
 */
/**
 * Column → the API's orderings (BATCH_SORTS). Kedaluwarsa's ascending order IS
 * the default pick order. Cabang is plain: a lot has no branch, and a central
 * warehouse serves several, so there is nothing stored to sort by. Gudang is
 * plain on BO's call (19 October 2026).
 */
const SORT_OPTIONS: SortOptions<BatchSort> = {
  batchCode: { asc: "batchCodeAsc", desc: "batchCodeDesc" },
  product: { asc: "productAsc", desc: "productDesc" },
  expiry: { asc: "expirySoonest", desc: "expiryLatest" },
  qty: { asc: "qtyAsc", desc: "qtyDesc", first: "desc" },
  cost: { asc: "costAsc", desc: "costDesc", first: "desc" },
  value: { asc: "valueAsc", desc: "valueDesc", first: "desc" },
};

function remainingOf(batch: ProductBatch): bigint {
  return toMinor(batch.qtyRemaining) ?? 0n;
}

function batchColumns(
  search: string,
  branchOf: (warehouseId: string) => string,
): DataTableColumn<ProductBatch>[] {
  return [
    {
      id: "batchCode",
      header: "Kode batch internal",
      cell: (batch) => (
        <>
          <span className="tabular-nums text-xs">
            <HighlightText text={batch.batchCode} query={search} />
          </span>
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
      id: "product",
      header: "Produk",
      // Room for a product name on one or two lines (BO, 19 October 2026).
      cellClassName: "min-w-[16rem] whitespace-normal",
      cell: (batch) => (
        <>
          {/* Null when the product was deleted after the lot was written — the
              API still names it wherever it can. */}
          <p className="text-sm font-medium">
            <HighlightText text={batch.productName ?? "—"} query={search} />
          </p>
          <p className="tabular-nums text-xs text-muted">
            <span className={SKU_WRAP_WIDE_CLASS}>
              <HighlightText text={batch.productSku ?? ""} query={search} />
            </span>
          </p>
        </>
      ),
    },
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-xs text-muted",
      cell: (batch) => branchOf(batch.warehouseId),
    },
    {
      id: "warehouse",
      header: "Gudang",
      cellClassName: "text-xs text-muted",
      cell: (batch) => batch.warehouseName ?? "—",
    },
    {
      id: "expiry",
      header: "Kedaluwarsa",
      cell: (batch) =>
        batch.expiryDate ? (
          <ExpiryBadge date={batch.expiryDate} />
        ) : (
          <span className="text-xs text-muted">tanpa expiry</span>
        ),
    },
    {
      id: "qty",
      header: "Sisa Stock",
      align: "right",
      // A withdrawal outran this lot. The row that needs fixing must not look
      // like the rows that do not.
      cellClassName: (batch) =>
        cn("text-sm", remainingOf(batch) < 0n && "font-semibold text-danger"),
      cell: (batch) => (
        <>
          {formatQty(batch.qtyRemaining)}
          {batch.productUnit && (
            <span className="text-xs text-muted"> {batch.productUnit}</span>
          )}
        </>
      ),
    },
    {
      id: "cost",
      header: "HPP",
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
    {
      // Aksi, behind the row's kebab (BO, 19 October 2026).
      id: "actions",
      header: "Aksi",
      align: "right",
      /* THE OTHER HALF OF A UNIQUE CODE. Lot codes are unique so that they can
         be scanned, and a code nothing can print is a code nothing can scan.
         Offered on an exhausted lot too — a label is reprinted for a carton
         that is still on a shelf, and "sisa 0" and "gone" are not the same
         thing. */
      cell: (batch) => (
        <RowLinkMenu
          name={batch.batchCode}
          links={[
            {
              href: `/dashboard/inventory/batches/labels?ids=${batch._id}`,
              label: "Cetak label",
              icon: <Printer />,
            },
          ]}
        />
      ),
    },
  ];
}

export function BatchesTable({
  batches,
  branchOf,
  sort,
  onSortChange,
  loading = false,
  page,
  totalPages,
  total,
  search,
  onPageChange,
  onSelect,
}: {
  batches: ProductBatch[];
  /**
   * The branch a lot's warehouse belongs to, already resolved and ready to
   * render — including the placeholders for a central warehouse and for a
   * lookup that has not landed. See `BatchesScreen`.
   */
  branchOf: (warehouseId: string) => string;
  /** The ordering the page is in — a header click asks for another. */
  sort: BatchSort;
  onSortChange: (sort: BatchSort) => void;
  /** A page is on its way: rows on screen dim, an empty table shows a spinner. */
  loading?: boolean;
  page: number;
  totalPages: number;
  total: number;
  /**
   * The live search term. Highlighted in the three cells the backend actually
   * matches on — batch code, product name, SKU — so a row that surfaced for a
   * reason invisible at a glance says which characters put it there.
   *
   * Also changes the empty copy: nothing found reads differently from nothing due.
   */
  search: string;
  onPageChange: (page: number) => void;
  /** A row was opened — the screen shows the lot's detail. Rows are plain when absent. */
  onSelect?: (batch: ProductBatch) => void;
}) {
  const searching = search.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={batchColumns(search, branchOf)}
        rows={batches}
        rowKey={(batch) => batch._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat daftar batch…"
        // Below this the frame scrolls sideways rather than squeezing Produk.
        tableClassName="min-w-[72rem]"
        rowClassName={(batch) => remainingOf(batch) === 0n && "opacity-55"}
        onRowClick={onSelect}
        empty={
          <div className="py-16 text-center">
            <p className="font-medium text-foreground">
              {searching
                ? "Tidak ada batch yang cocok"
                : "Tidak ada batch di rentang ini"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {searching
                ? "Coba potongannya saja — pencarian mencocokkan sebagian kode batch, nama produk, atau SKU."
                : "Longgarkan rentangnya, atau pilih cabang atau gudang lain."}
            </p>
          </div>
        }
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        unit="batch"
        unitPlural="batch"
        onPageChange={onPageChange}
      />
    </div>
  );
}
