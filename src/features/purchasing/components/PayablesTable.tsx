"use client";

import Link from "next/link";

import { HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
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
import { formatMoney, isPositive } from "@/utils/decimal";
import type { PurchaseInvoiceListRow } from "@/types/api";

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
 * THE ACTION LABEL READS THE STATUS, not the outstanding amount: "Bayar" on
 * something already settled is an invitation to an endpoint that will refuse it.
 */
export function PayablesTable({
  invoices,
  loading,
  search,
  canPay,
}: {
  invoices: PurchaseInvoiceListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a search hit explains itself. */
  search: string;
  /** Whether the signed-in role may record a payment — decides the CTA wording. */
  canPay: boolean;
}) {
  if (!loading && invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada faktur yang cocok dengan filter ini.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Faktur muncul setelah tagihan supplier dicatat atas sebuah penerimaan
          beli putus.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table className={loading ? "opacity-60" : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Faktur</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Jatuh tempo</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Dibayar</TableHead>
            <TableHead className="text-right">Sisa</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const href = `/dashboard/purchasing/payables/${invoice._id}`;
            const lateBy = Math.abs(daysUntil(invoice.dueDate));

            return (
              <TableRow
                key={invoice._id}
                className={cn(invoice.isOverdue && "bg-danger/5")}
              >
                <TableCell className="font-mono text-xs">
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

                <TableCell className="text-sm font-medium">
                  {invoice.supplierName ?? "—"}
                </TableCell>

                <TableCell className="text-xs">
                  <span
                    className={cn(
                      invoice.isOverdue && "font-semibold text-danger",
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                  </span>
                  {invoice.isOverdue && (
                    <span className="ml-1 text-danger">
                      · telat {lateBy} hari
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatMoney(invoice.total)}
                </TableCell>

                <TableCell className="text-right font-mono text-xs tabular-nums text-muted">
                  {formatMoney(invoice.paidAmount)}
                </TableCell>

                {/* The column the screen exists for, so it carries the weight —
                    and it is the SERVER's `total - paidAmount`, not a subtraction
                    done here against two strings. */}
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm font-semibold tabular-nums",
                    isPositive(invoice.outstandingAmount) && "text-danger",
                  )}
                >
                  {formatMoney(invoice.outstandingAmount)}
                </TableCell>

                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>

                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={href}>
                      {invoice.status !== "paid" && canPay ? "Bayar" : "Detail"}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
