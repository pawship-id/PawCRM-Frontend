"use client";

import Link from "next/link";
import { Ban, BanknoteArrowDown, Eye, Printer } from "lucide-react";

import {
  DataTable,
  HighlightText,
  RowLinkMenu,
  type DataTableColumn,
  type RowAction,
  type SortOptions,
} from "@/components";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney, isPositive } from "@/utils/decimal";
import type { CustomerInvoiceListRow } from "@/types/api";

import type { CustomerInvoiceSort } from "../hooks/useCustomerInvoices";
import { InvoiceSourceBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";

/** `2026-08-06T…` → `06 Agu 2026`. The format the whole module shows dates in. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Which server ordering each sortable header means, in each direction.
 *
 * EVERY ONE IS A NAME THE API KNOWS — nothing is sorted in the browser, which
 * would order one page of twenty-five while the pager claimed to walk them all.
 * First click: A first for the number, soonest first for Jatuh tempo, newest
 * and largest first for Tanggal, Nilai and Sisa (ui-rules §8). Pelanggan,
 * Cabang, Sumber, Status and Aksi are plain.
 */
const SORT_OPTIONS: SortOptions<CustomerInvoiceSort> = {
  number: { asc: "numberAsc", desc: "numberDesc" },
  invoiceDate: { asc: "oldest", desc: "newest", first: "desc" },
  dueDate: { asc: "dueSoonest", desc: "dueLatest" },
  total: { asc: "totalLowest", desc: "totalHighest", first: "desc" },
  outstanding: {
    asc: "outstandingLowest",
    desc: "outstandingHighest",
    first: "desc",
  },
};

function receivablesColumns({
  search,
  mayPay,
  mayVoid,
  onPay,
  onVoid,
}: {
  search: string;
  mayPay: boolean;
  mayVoid: boolean;
  onPay: (invoice: CustomerInvoiceListRow) => void;
  onVoid: (invoice: CustomerInvoiceListRow) => void;
}): DataTableColumn<CustomerInvoiceListRow>[] {
  return [
    {
      id: "number",
      header: "Faktur",
      cellClassName: "text-sm font-semibold tabular-nums",
      cell: (invoice) => (
        <Link
          href={`/dashboard/sales/invoice/${invoice._id}`}
          className="text-primary-hover hover:underline"
        >
          <HighlightText text={invoice.invoiceNumber} query={search} />
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Pelanggan",
      cellClassName: (invoice) =>
        cn("text-sm font-medium", invoice.status === "void" && "text-muted"),
      /*
        TWO DIFFERENT NULLS, told apart by the ID. No customer at all is a
        WALK-IN; an id whose lookup came back empty is a customer somebody
        deleted, and that debt still stands.
      */
      cell: (invoice) =>
        invoice.customerName ? (
          <HighlightText text={invoice.customerName} query={search} />
        ) : invoice.customerId ? (
          "—"
        ) : (
          "Pelanggan umum"
        ),
    },
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-sm text-muted",
      cell: (invoice) => invoice.branchName ?? "—",
    },
    {
      id: "invoiceDate",
      header: "Tanggal",
      cellClassName: "text-sm tabular-nums",
      cell: (invoice) => formatDate(invoice.invoiceDate),
    },
    {
      id: "dueDate",
      header: "Jatuh tempo",
      cellClassName: "text-sm tabular-nums",
      cell: (invoice) => (
        <>
          <span
            className={cn(
              invoice.isOverdue && "font-semibold text-danger-ink",
            )}
          >
            {formatDate(invoice.dueDate)}
          </span>
          {invoice.isOverdue && (
            <span className="block text-xs font-semibold text-danger-ink">
              telat {Math.abs(daysUntil(invoice.dueDate))} hari
            </span>
          )}
        </>
      ),
    },
    {
      id: "total",
      header: "Nilai",
      align: "right",
      cellClassName: (invoice) =>
        cn("text-sm", invoice.status === "void" && "text-muted line-through"),
      cell: (invoice) => formatMoney(invoice.total),
    },
    {
      id: "outstanding",
      header: "Sisa",
      align: "right",
      cellClassName: (invoice) =>
        cn(
          "text-sm font-semibold",
          invoice.status === "void" && "font-normal text-muted",
        ),
      cell: (invoice) =>
        invoice.status === "void" ? "—" : formatMoney(invoice.outstandingAmount),
    },
    {
      id: "source",
      header: "Sumber",
      cell: (invoice) => <InvoiceSourceBadge source={invoice.source} />,
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
        const href = `/dashboard/sales/invoice/${invoice._id}`;
        const voided = invoice.status === "void";
        const collectable =
          invoice.status === "unpaid" || invoice.status === "partial";

        const actions: RowAction[] = [];
        if (mayPay && collectable) {
          actions.push({
            label: "Bayar",
            icon: <BanknoteArrowDown />,
            onSelect: () => onPay(invoice),
          });
        }
        if (mayVoid && !voided && !isPositive(invoice.paidAmount)) {
          actions.push({
            label: "Batalkan faktur",
            icon: <Ban />,
            destructive: true,
            onSelect: () => onVoid(invoice),
          });
        }

        return (
          <RowLinkMenu
            name={invoice.invoiceNumber}
            links={[
              { href, label: "Detail", icon: <Eye /> },
              { href: `${href}/print`, label: "Cetak faktur", icon: <Printer /> },
            ]}
            actions={actions}
          />
        );
      },
    },
  ];
}

/**
 * The Penjualan list, one invoice per row — through the shared `DataTable`
 * since 20 October 2026, sorting from its headers.
 *
 * `isOverdue` COMES FROM THE SERVER and is not recomputed here — it is evaluated
 * against one instant for the whole page, and it already folds in "not settled
 * and not void". `daysUntil` only says HOW late, never WHETHER.
 *
 * A VOIDED ROW IS MUTED, ITS NILAI STRUCK THROUGH AND ITS SISA A DASH. It is not
 * a debt, but its number was issued and can never be reused, so it stays.
 *
 * ROW ACTIONS sit behind one ⋮ (`RowLinkMenu`), each behind its own grant:
 *
 *   Detail         — anyone who can read the list.
 *   Cetak faktur   — anyone who can read the list; it opens the print page.
 *   Bayar          — `customerInvoices:pay`, only while something is owed. It
 *                    opens the payment dialog in place, as on Pembelian.
 *   Batalkan       — `customerInvoices:void`, and only while NOTHING is paid.
 *                    The server refuses a void while a payment still counts; a
 *                    menu row that opens a dialog only to be refused should not
 *                    be offered. `paidAmount` is the list's stand-in for "an
 *                    active payment" — a cancelled payment has already been
 *                    taken back out of it.
 */
export function ReceivablesTable({
  invoices,
  loading,
  search,
  sort,
  onSort,
  onPay,
  onVoid,
}: {
  invoices: CustomerInvoiceListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a search hit explains itself. */
  search: string;
  sort: CustomerInvoiceSort;
  onSort: (sort: CustomerInvoiceSort) => void;
  onPay: (invoice: CustomerInvoiceListRow) => void;
  onVoid: (invoice: CustomerInvoiceListRow) => void;
}) {
  const { can } = usePermissions();
  const mayPay = can("customerInvoices", "pay");
  const mayVoid = can("customerInvoices", "void");

  return (
    <DataTable
      bare
      columns={receivablesColumns({ search, mayPay, mayVoid, onPay, onVoid })}
      rows={invoices}
      rowKey={(invoice) => invoice._id}
      sort={{ value: sort, options: SORT_OPTIONS, onChange: onSort }}
      loading={loading}
      rowClassName={(invoice) => invoice.isOverdue && "bg-danger/5"}
      tableClassName="min-w-[64rem]"
      empty={
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            Tidak ada faktur yang cocok dengan filter ini.
          </p>
          <p className="mt-1 text-sm text-muted">
            Coba ganti periode, atau kosongkan filter dan pencariannya.
          </p>
        </div>
      }
    />
  );
}
