"use client";

import Link from "next/link";

import { HighlightText } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoiceListRow } from "@/types/api";

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
 * What customers owe, one debt per row.
 *
 * `isOverdue` COMES FROM THE SERVER and is not recomputed here. It is evaluated
 * against one instant for the whole page, so two invoices due at the same moment
 * cannot land on opposite sides of it because the clock ticked mid-render — and
 * it already folds in "not settled and not void", which a bare date comparison
 * would miss: `dueDate` keeps its value after payment, so a calendar-only test
 * would report every invoice ever paid late as still outstanding.
 *
 * `daysUntil` IS STILL USED, but only to say HOW late, never WHETHER. The count
 * is a local, drifting-by-a-day-at-worst nicety; the fact is the server's.
 *
 * A VOIDED ROW IS MUTED AND ITS TOTAL STRUCK THROUGH. It is not a debt and must
 * not read as one at glance-distance, but it is not deleted either — the number
 * was issued and can never be reused, so the row stays legible rather than
 * disappearing.
 */
export function ReceivablesTable({
  invoices,
  loading,
  search,
}: {
  invoices: CustomerInvoiceListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a search hit explains itself. */
  search: string;
}) {
  if (!loading && invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada faktur yang cocok dengan filter ini.
        </p>
        <p className="mt-1 text-sm text-muted">
          Faktur muncul otomatis saat kasir menyelesaikan penjualan dengan
          pembayaran Piutang.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <Table className={loading ? "opacity-60" : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Faktur</TableHead>
            <TableHead>Pelanggan</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Tanggal</TableHead>
            <TableHead>Jatuh tempo</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Dibayar</TableHead>
            <TableHead className="text-right">Sisa</TableHead>
            <TableHead>Sumber</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const href = `/dashboard/sales/${invoice._id}`;
            const lateBy = Math.abs(daysUntil(invoice.dueDate));
            const voided = invoice.status === "void";

            return (
              <TableRow
                key={invoice._id}
                className={cn(invoice.isOverdue && "bg-danger/5")}
              >
                <TableCell className="tabular-nums text-xs">
                  <Link
                    href={href}
                    className="text-primary-hover hover:underline"
                  >
                    <HighlightText
                      text={invoice.invoiceNumber}
                      query={search}
                    />
                  </Link>
                </TableCell>

                <TableCell
                  className={cn("text-sm font-medium", voided && "text-muted")}
                >
                  {/*
                    TWO DIFFERENT NULLS, told apart by the ID rather than by the
                    name. No customer at all is a WALK-IN — since every till sale
                    raises a faktur, most cash rows have nobody attached, and a
                    dash there reads as missing data on a document that is
                    complete. An id whose lookup came back empty is a customer
                    somebody deleted, and that debt still stands.
                  */}
                  {invoice.customerName ??
                    (invoice.customerId ? "—" : "Pelanggan umum")}
                </TableCell>

                <TableCell className="text-sm text-muted">
                  {invoice.branchName ?? "—"}
                </TableCell>

                <TableCell className="text-sm text-muted tabular-nums">
                  {formatDate(invoice.invoiceDate)}
                </TableCell>

                <TableCell className="text-sm tabular-nums">
                  <span
                    className={cn(
                      invoice.isOverdue
                        ? "font-semibold text-danger-ink"
                        : "text-muted",
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                  </span>
                  {invoice.isOverdue && (
                    <span className="block text-xs font-medium text-danger-ink">
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

                <TableCell className="text-right text-sm tabular-nums text-muted">
                  {formatMoney(invoice.paidAmount)}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right text-sm font-semibold tabular-nums",
                    voided && "font-normal text-muted",
                  )}
                >
                  {/* A voided invoice has an outstanding figure like any other,
                      and showing it would invite somebody to chase it. */}
                  {voided ? "—" : formatMoney(invoice.outstandingAmount)}
                </TableCell>

                <TableCell>
                  <InvoiceSourceBadge source={invoice.source} />
                </TableCell>

                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
