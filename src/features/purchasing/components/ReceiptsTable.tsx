"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import {
  DataTable,
  HighlightText,
  RowLinkMenu,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/utils/decimal";
import type { GoodsReceiptListRow, GoodsReceiptSort } from "@/types/api";

import { ReceiptStatusBadge } from "./ReceiptStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

/** `2026-08-06T…` → `06 Agu 2026`. The only date format this module shows. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 19 October 2026), on the server:
 * each sortable column maps to the two names GOODS_RECEIPT_SORTS knows for it.
 * Nomor takes A first; Tanggal (the arrival date), Item and Nilai take the
 * newest / largest first. Item is the line count and Nilai the grand total,
 * tax included — the server computes both exactly as the cells show them.
 * Supplier, Cabang, Gudang, Jenis, Status, Faktur and Aksi are plain.
 */
const SORT_OPTIONS: SortOptions<GoodsReceiptSort> = {
  number: { asc: "numberAsc", desc: "numberDesc" },
  date: { asc: "oldest", desc: "newest", first: "desc" },
  itemCount: { asc: "itemCountAsc", desc: "itemCountDesc", first: "desc" },
  value: { asc: "valueAsc", desc: "valueDesc", first: "desc" },
};

function receiptColumns(search: string): DataTableColumn<GoodsReceiptListRow>[] {
  return [
    {
      id: "number",
      header: "Nomor",
      cellClassName: "tabular-nums text-xs",
      cell: (receipt) => (
        <Link
          href={`/dashboard/purchasing/receipts/${receipt._id}`}
          className="text-primary-hover hover:underline"
        >
          <HighlightText text={receipt.receiptNumber} query={search} />
        </Link>
      ),
    },
    {
      id: "date",
      header: "Tanggal",
      cellClassName: "text-xs tabular-nums",
      cell: (receipt) => formatDate(receipt.receiptDate),
    },
    {
      id: "supplier",
      header: "Supplier",
      cellClassName: "text-sm font-medium",
      cell: (receipt) => receipt.supplierName ?? "—",
    },
    /* BRANCH BEFORE WAREHOUSE — widest scope first, the way the receipt form
       asks the same two questions. They are not the same answer either: a
       branch may receive at its own warehouse AND at the shared central one,
       so a column of warehouses cannot be read as a column of branches. */
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-xs text-muted",
      // "—" for a delivery written before the branch was recorded; those stay
      // blank until the backfill has run.
      cell: (receipt) => receipt.branchName ?? "—",
    },
    {
      id: "warehouse",
      header: "Gudang",
      cellClassName: "text-xs text-muted",
      cell: (receipt) => receipt.warehouseName ?? "—",
    },
    {
      id: "type",
      header: "Jenis",
      cell: (receipt) => <SupplierTypeBadge type={receipt.purchaseType} />,
    },
    {
      id: "status",
      header: "Status",
      cell: (receipt) => <ReceiptStatusBadge status={receipt.status} />,
    },
    {
      id: "itemCount",
      header: "Item",
      align: "right",
      cellClassName: "text-xs",
      cell: (receipt) => receipt.itemCount,
    },
    {
      id: "value",
      header: "Nilai",
      align: "right",
      cellClassName: "text-sm",
      // `grandTotal` — what the supplier is owed, tax included. The ex-tax
      // `total` is on the detail, where the split is the point.
      cell: (receipt) => formatMoney(receipt.grandTotal),
    },
    {
      id: "invoice",
      header: "Faktur",
      cell: (receipt) =>
        receipt.invoiceId ? (
          <Link
            href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}
            className="tabular-nums text-xs text-primary-hover hover:underline"
          >
            Lihat faktur
          </Link>
        ) : (
          <Badge
            variant="outline"
            className="border-transparent bg-secondary/25 text-secondary-foreground"
          >
            {receipt.purchaseType === "konsinyasi"
              ? "Tanpa faktur"
              : "Belum difakturkan"}
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "Aksi",
      align: "right",
      // Behind the row's kebab, like every Inventori list (BO, 19 October
      // 2026). Detail is the one place a posted receipt leads.
      cell: (receipt) => (
        <RowLinkMenu
          name={receipt.receiptNumber}
          links={[
            {
              href: `/dashboard/purchasing/receipts/${receipt._id}`,
              label: "Detail",
              icon: <Eye />,
            },
          ]}
        />
      ),
    },
  ];
}

/**
 * The goods-receipt list table.
 *
 * NOTHING TO ACT ON IN THE ROW ITSELF, and that is the whole shape of it: the
 * kebab holds Detail and nothing that writes, and there is no ConfirmDialog —
 * unlike SuppliersTable — because a posted receipt is changed only from its
 * detail (receiving, closing), never from the list. Every row leads to one
 * place, its detail.
 *
 * THE FAKTUR COLUMN IS WHERE THE TWO PURCHASE TYPES VISIBLY DIVERGE, and it is
 * the fastest way to answer "why does this delivery not appear in my payables"
 * without opening anything. It is NOT, however, a debt indicator: a `beli_putus`
 * receipt credits `2101 Utang Usaha` the moment it posts, and `invoiceId`
 * stays null until the vendor's own bill is filed against it. The column says
 * whether the supplier's document has arrived, not whether money is owed — which
 * is why the empty state reads "belum difakturkan" rather than "tanpa utang".
 */
export function ReceiptsTable({
  receipts,
  loading,
  search,
  sort,
  onSortChange,
}: {
  receipts: GoodsReceiptListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
  /** The ordering the list is in — a header click asks for another. */
  sort: GoodsReceiptSort;
  onSortChange: (next: GoodsReceiptSort) => void;
}) {
  return (
    <DataTable
      columns={receiptColumns(search)}
      rows={receipts}
      rowKey={(receipt) => receipt._id}
      sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
      loading={loading}
      empty={
        <div className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="font-medium text-foreground">
            Tidak ada penerimaan yang cocok dengan filter ini.
          </p>
          <p className="max-w-md text-sm text-muted">
            Catat barang masuk — penerimaan inilah yang membentuk HPP.
          </p>
        </div>
      }
    />
  );
}
