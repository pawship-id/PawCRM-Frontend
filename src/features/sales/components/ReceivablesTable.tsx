"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical } from "lucide-react";

import { HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type SortColumn = "invoiceDate" | "dueDate" | "total" | "outstanding";

/**
 * Which server ordering each sortable header means, in each direction.
 *
 * EVERY ONE IS A NAME THE API KNOWS — nothing is sorted in the browser, which
 * would order one page of twenty-five while the pager claimed to walk them all.
 */
const SORT_COLUMNS: Record<
  SortColumn,
  { asc: CustomerInvoiceSort; desc: CustomerInvoiceSort }
> = {
  invoiceDate: { asc: "oldest", desc: "newest" },
  dueDate: { asc: "dueSoonest", desc: "dueLatest" },
  total: { asc: "totalLowest", desc: "totalHighest" },
  outstanding: { asc: "outstandingLowest", desc: "outstandingHighest" },
};

function directionOf(
  column: SortColumn,
  sort: CustomerInvoiceSort,
): "asc" | "desc" | null {
  if (SORT_COLUMNS[column].asc === sort) return "asc";
  if (SORT_COLUMNS[column].desc === sort) return "desc";
  return null;
}

/** The same header flips its direction; a different header starts ascending. */
export function nextSort(
  column: SortColumn,
  sort: CustomerInvoiceSort,
): CustomerInvoiceSort {
  return directionOf(column, sort) === "asc"
    ? SORT_COLUMNS[column].desc
    : SORT_COLUMNS[column].asc;
}

/**
 * The Penjualan list, one invoice per row.
 *
 * `isOverdue` COMES FROM THE SERVER and is not recomputed here — it is evaluated
 * against one instant for the whole page, and it already folds in "not settled
 * and not void". `daysUntil` only says HOW late, never WHETHER.
 *
 * A VOIDED ROW IS MUTED, ITS NILAI STRUCK THROUGH AND ITS SISA A DASH. It is not
 * a debt, but its number was issued and can never be reused, so it stays.
 *
 * ROW ACTIONS, each behind its own grant:
 *
 *   Bayar          — `customerInvoices:pay`, only while something is owed. NOT
 *                    ORANGE, as the mockup draws it: docs/ui-rules.md §7 has no
 *                    orange button in the product, because orange means "a
 *                    human must act" and a button on every row would spend it.
 *   Cetak faktur   — anyone who can read the list; it opens the print page.
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

  if (!loading && invoices.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada faktur yang cocok dengan filter ini.
        </p>
        <p className="mt-1 text-sm text-muted">
          Coba ganti periode, atau kosongkan filter dan pencariannya.
        </p>
      </div>
    );
  }

  const header = { sort, onSort };

  return (
    <div className="overflow-x-auto">
      <Table className={cn("min-w-[64rem]", loading && "opacity-60")}>
        <TableHeader>
          <TableRow>
            <TableHead>Faktur</TableHead>
            <TableHead>Pelanggan</TableHead>
            <TableHead>Cabang</TableHead>
            <SortableHead column="invoiceDate" label="Tanggal" {...header} />
            <SortableHead column="dueDate" label="Jatuh tempo" {...header} />
            <SortableHead column="total" label="Nilai" align="right" {...header} />
            <SortableHead column="outstanding" label="Sisa" align="right" {...header} />
            <TableHead>Sumber</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Aksi</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const href = `/dashboard/sales/${invoice._id}`;
            const lateBy = Math.abs(daysUntil(invoice.dueDate));
            const voided = invoice.status === "void";
            const collectable =
              invoice.status === "unpaid" || invoice.status === "partial";

            return (
              <TableRow
                key={invoice._id}
                className={cn(invoice.isOverdue && "bg-danger/5")}
              >
                <TableCell className="text-sm font-semibold tabular-nums">
                  <Link href={href} className="text-primary-hover hover:underline">
                    <HighlightText text={invoice.invoiceNumber} query={search} />
                  </Link>
                </TableCell>

                <TableCell
                  className={cn("text-sm font-medium", voided && "text-muted")}
                >
                  {/*
                    TWO DIFFERENT NULLS, told apart by the ID. No customer at all
                    is a WALK-IN; an id whose lookup came back empty is a customer
                    somebody deleted, and that debt still stands.
                  */}
                  {invoice.customerName ? (
                    <HighlightText text={invoice.customerName} query={search} />
                  ) : invoice.customerId ? (
                    "—"
                  ) : (
                    "Pelanggan umum"
                  )}
                </TableCell>

                <TableCell className="text-sm text-muted">
                  {invoice.branchName ?? "—"}
                </TableCell>

                <TableCell className="text-sm tabular-nums">
                  {formatDate(invoice.invoiceDate)}
                </TableCell>

                <TableCell className="text-sm tabular-nums">
                  <span
                    className={cn(invoice.isOverdue && "font-semibold text-danger-ink")}
                  >
                    {formatDate(invoice.dueDate)}
                  </span>
                  {invoice.isOverdue && (
                    <span className="block text-xs font-semibold text-danger-ink">
                      telat {lateBy} hari
                    </span>
                  )}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right text-sm tabular-nums",
                    voided && "text-muted line-through",
                  )}
                >
                  {formatMoney(invoice.total)}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right text-sm font-semibold tabular-nums",
                    voided && "font-normal text-muted",
                  )}
                >
                  {voided ? "—" : formatMoney(invoice.outstandingAmount)}
                </TableCell>

                <TableCell>
                  <InvoiceSourceBadge source={invoice.source} />
                </TableCell>

                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {mayPay && collectable && (
                      <Button
                        variant="secondary"
                        onClick={() => onPay(invoice)}
                        aria-label={`Bayar ${invoice.invoiceNumber}`}
                      >
                        Bayar
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Aksi lain ${invoice.invoiceNumber}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link href={href}>Lihat detail</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`${href}/print`}>Cetak faktur</Link>
                        </DropdownMenuItem>
                        {mayVoid && !voided && !isPositive(invoice.paidAmount) && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onVoid(invoice)}
                          >
                            Batalkan faktur
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A column header that sorts. A real `<button>` inside the `<th>`, with
 * `aria-sort` on the header, so a screen reader hears both that it can be
 * pressed and which way the column is ordered now.
 */
function SortableHead({
  column,
  label,
  sort,
  onSort,
  align = "left",
}: {
  column: SortColumn;
  label: string;
  sort: CustomerInvoiceSort;
  onSort: (sort: CustomerInvoiceSort) => void;
  align?: "left" | "right";
}) {
  const direction = directionOf(column, sort);
  const Icon =
    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn(align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(column, sort))}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          direction && "text-primary",
        )}
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5", !direction && "opacity-50")} />
      </button>
    </TableHead>
  );
}
