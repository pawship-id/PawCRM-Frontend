"use client";

import Link from "next/link";
import { BanknoteArrowUp, Eye, PackageCheck } from "lucide-react";

import {
  DataTable,
  HighlightText,
  RowLinkMenu,
  type DataTableColumn,
  type RowAction,
  type RowLink,
  type SortOptions,
} from "@/components";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney, isPositive, toMinor } from "@/utils/decimal";
import type { PurchaseInvoiceListRow, PurchaseInvoiceSort } from "@/types/api";

import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

/** `2026-08-06T…` → `06 Agu 2026`. The format the whole module shows dates in. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 19 October 2026), on the server:
 * each sortable column maps to the two names PURCHASE_INVOICE_SORTS knows for
 * it. Faktur and Jatuh tempo take A / soonest first; Total, Dibayar and Sisa
 * take the largest first. Sisa is the server's own `total − paidAmount`, the
 * figure the column shows. Supplier, Cabang, Gudang, Status and Aksi are plain.
 */
const SORT_OPTIONS: SortOptions<PurchaseInvoiceSort> = {
  number: { asc: "numberAsc", desc: "numberDesc" },
  dueDate: { asc: "dueSoonest", desc: "dueLatest" },
  total: { asc: "totalAsc", desc: "totalDesc", first: "desc" },
  paid: { asc: "paidAsc", desc: "paidDesc", first: "desc" },
  outstanding: {
    asc: "outstandingAsc",
    desc: "outstandingDesc",
    first: "desc",
  },
};

function payablesColumns({
  search,
  canPay,
  canReceive,
  onPay,
}: {
  search: string;
  canPay: boolean;
  canReceive: boolean;
  onPay: (invoice: PurchaseInvoiceListRow) => void;
}): DataTableColumn<PurchaseInvoiceListRow>[] {
  return [
    {
      id: "number",
      header: "Faktur",
      cellClassName: "tabular-nums text-xs",
      cell: (invoice) => (
        <>
          <Link
            href={`/dashboard/purchasing/payables/${invoice._id}`}
            className="text-primary-hover hover:underline"
          >
            <HighlightText text={invoice.invoiceNumber} query={search} />
          </Link>
          {/* The vendor's own number under ours, when it differs — what they
              quote when they chase payment. */}
          {invoice.supplierInvoiceNumber &&
            invoice.supplierInvoiceNumber !== invoice.invoiceNumber && (
              <span className="block text-xs text-muted">
                supplier:{" "}
                <HighlightText
                  text={invoice.supplierInvoiceNumber}
                  query={search}
                />
              </span>
            )}
          {/* A manual bill still waiting for its goods owes nothing yet —
              said here, so "Sisa" is not read as payable. */}
          {!invoice.goodsReceiptId && (
            <span className="block text-xs text-muted">
              barang belum diterima
            </span>
          )}
        </>
      ),
    },
    {
      id: "supplier",
      header: "Supplier",
      cellClassName: "text-sm font-medium",
      cell: (invoice) => invoice.supplierName ?? "—",
    },
    /* BRANCH BEFORE WAREHOUSE — widest scope first, the same order and the
       same two questions ReceiptsTable asks. They are not one answer: a branch
       may receive at its own warehouse AND at the shared central one, so a
       column of warehouses cannot be read as a column of branches, and a
       tenant paying bills per clinic needs both to tell two of them apart. */
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-xs text-muted",
      // "—" for a branch hard-deleted since. The bill still stands; only its
      // label is gone.
      cell: (invoice) => invoice.branchName ?? "—",
    },
    {
      id: "warehouse",
      header: "Gudang",
      cellClassName: "text-xs text-muted",
      // The warehouse comes from the DELIVERY this bill is for, not from the
      // invoice — so "—" also covers a delivery that can no longer be read,
      // which the branch column cannot.
      cell: (invoice) => invoice.warehouseName ?? "—",
    },
    {
      id: "dueDate",
      header: "Jatuh tempo",
      cellClassName: "text-xs",
      cell: (invoice) => (
        <>
          <span
            className={cn(invoice.isOverdue && "font-semibold text-danger")}
          >
            {formatDate(invoice.dueDate)}
          </span>
          {invoice.isOverdue && (
            <span className="ml-1 text-danger">
              · telat {Math.abs(daysUntil(invoice.dueDate))} hari
            </span>
          )}
        </>
      ),
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      cellClassName: "text-xs",
      cell: (invoice) => formatMoney(invoice.total),
    },
    {
      id: "paid",
      header: "Dibayar",
      align: "right",
      cellClassName: "text-xs text-muted",
      cell: (invoice) => formatMoney(invoice.paidAmount),
    },
    {
      id: "outstanding",
      header: "Sisa",
      align: "right",
      // The column the screen exists for, so it carries the weight — and it is
      // the SERVER's `total - paidAmount`, not a subtraction done here against
      // two strings.
      cellClassName: (invoice) =>
        cn(
          "text-sm font-semibold",
          isPositive(invoice.outstandingAmount) && "text-danger",
        ),
      cell: (invoice) => formatMoney(invoice.outstandingAmount),
    },
    {
      id: "status",
      header: "Status",
      cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
    },
    {
      id: "actions",
      header: "Aksi",
      align: "right",
      cellClassName: "whitespace-nowrap",
      cell: (invoice) => {
        const stillToCome =
          (toMinor(invoice.receivedAmount) ?? 0n) <
          (toMinor(invoice.total) ?? 0n);
        const links: RowLink[] = [
          {
            href: `/dashboard/purchasing/payables/${invoice._id}`,
            label: "Detail",
            icon: <Eye />,
          },
        ];
        if (canReceive && stillToCome) {
          links.push({
            href: `/dashboard/purchasing/receipts/new?invoice=${invoice._id}`,
            label: "Buat penerimaan barang",
            icon: <PackageCheck />,
          });
        }
        const actions: RowAction[] =
          canPay &&
          invoice.status !== "paid" &&
          isPositive(invoice.payableAmount)
            ? [
                {
                  label: "Bayar",
                  icon: <BanknoteArrowUp />,
                  onSelect: () => onPay(invoice),
                },
              ]
            : [];

        return (
          <RowLinkMenu
            name={invoice.invoiceNumber}
            links={links}
            actions={actions}
          />
        );
      },
    },
  ];
}

/**
 * What the tenant owes, one bill per row.
 *
 * `isOverdue` COMES FROM THE SERVER and is not recomputed here. It is evaluated
 * against one instant for the whole page, so two bills due at the same moment
 * cannot land on opposite sides of it because the clock ticked mid-render — and
 * it already folds in "not settled", which a bare date comparison would miss:
 * `dueDate` keeps its value after payment, so a calendar-only test would report
 * every invoice ever paid late as still outstanding.
 *
 * `daysUntil` IS STILL USED, but only to say HOW late, never WHETHER. The count
 * is a local, drifting-by-a-day-at-worst nicety; the fact is the server's.
 *
 * ONE ⋮ MENU PER ROW (16 October 2026, on request) — the shared
 * `RowLinkMenu` since 19 October 2026: Detail always; "Buat penerimaan
 * barang" while goods are still to come; and, below the separator because it
 * writes, Bayar only while the status is not settled AND something is payable
 * now — "Bayar" on a settled bill, or one whose goods have not arrived, is an
 * invitation to an endpoint that will refuse it. Bayar opens the payment dialog
 * in place, as on Faktur Penjualan. "Still to come" is read off
 * `receivedAmount < total` — the list row carries no per-line quantities, and
 * the server caps `receivedAmount` at the total, so equality means everything
 * has arrived.
 */
export function PayablesTable({
  invoices,
  loading,
  search,
  sort,
  onSortChange,
  canPay,
  canReceive,
  onPay,
}: {
  invoices: PurchaseInvoiceListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a search hit explains itself. */
  search: string;
  /** The ordering the list is in — a header click asks for another. */
  sort: PurchaseInvoiceSort;
  onSortChange: (next: PurchaseInvoiceSort) => void;
  /** Whether the signed-in role may record a payment — decides whether Bayar is offered. */
  canPay: boolean;
  /** Whether the signed-in role may create a goods receipt. */
  canReceive: boolean;
  onPay: (invoice: PurchaseInvoiceListRow) => void;
}) {
  return (
    <DataTable
      columns={payablesColumns({ search, canPay, canReceive, onPay })}
      rows={invoices}
      rowKey={(invoice) => invoice._id}
      sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
      loading={loading}
      rowClassName={(invoice) => invoice.isOverdue && "bg-danger/5"}
      empty={
        <div className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="font-medium text-foreground">
            Tidak ada faktur yang cocok dengan filter ini.
          </p>
          <p className="max-w-md text-sm text-muted">
            Faktur muncul setelah tagihan supplier dicatat atas sebuah
            penerimaan beli putus.
          </p>
        </div>
      }
    />
  );
}
