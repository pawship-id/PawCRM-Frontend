"use client";

import Link from "next/link";
import { MoreVertical } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney, isPositive, toMinor } from "@/utils/decimal";
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
 * ONE ⋮ MENU PER ROW (16 October 2026, on request): Detail always; Bayar only
 * while the status is not settled AND something is payable now — "Bayar" on a
 * settled bill, or one whose goods have not arrived, is an invitation to an
 * endpoint that will refuse it; and "Buat penerimaan barang" while goods are
 * still to come. Bayar opens the payment dialog in place, as on Faktur
 * Penjualan. "Still to come" is read off `receivedAmount < total` — the list row
 * carries no per-line quantities, and the server caps `receivedAmount` at the
 * total, so equality means everything has arrived.
 */
export function PayablesTable({
  invoices,
  loading,
  search,
  canPay,
  canReceive,
  onPay,
}: {
  invoices: PurchaseInvoiceListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a search hit explains itself. */
  search: string;
  /** Whether the signed-in role may record a payment — decides whether Bayar is offered. */
  canPay: boolean;
  /** Whether the signed-in role may create a goods receipt. */
  canReceive: boolean;
  onPay: (invoice: PurchaseInvoiceListRow) => void;
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
            {/* BRANCH BEFORE WAREHOUSE — widest scope first, the same order and
                the same two questions ReceiptsTable asks. They are not one
                answer: a branch may receive at its own warehouse AND at the
                shared central one, so a column of warehouses cannot be read as
                a column of branches, and a tenant paying bills per clinic needs
                both to tell two of them apart. */}
            <TableHead>Cabang</TableHead>
            <TableHead>Gudang</TableHead>
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
            const stillToCome =
              (toMinor(invoice.receivedAmount) ?? 0n) <
              (toMinor(invoice.total) ?? 0n);

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
                  {/* The vendor's own number under ours, when it differs —
                      what they quote when they chase payment. */}
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
                  {/* A manual bill still waiting for its goods owes nothing
                      yet — said here, so "Sisa" is not read as payable. */}
                  {!invoice.goodsReceiptId && (
                    <span className="block text-xs text-muted">
                      barang belum diterima
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-sm font-medium">
                  {invoice.supplierName ?? "—"}
                </TableCell>

                {/* "—" for a branch hard-deleted since. The bill still stands;
                    only its label is gone. */}
                <TableCell className="text-xs text-muted">
                  {invoice.branchName ?? "—"}
                </TableCell>

                {/* The warehouse comes from the DELIVERY this bill is for, not
                    from the invoice — so "—" also covers a delivery that can no
                    longer be read, which the branch column cannot. */}
                <TableCell className="text-xs text-muted">
                  {invoice.warehouseName ?? "—"}
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

                <TableCell className="text-right tabular-nums text-xs">
                  {formatMoney(invoice.total)}
                </TableCell>

                <TableCell className="text-right tabular-nums text-xs text-muted">
                  {formatMoney(invoice.paidAmount)}
                </TableCell>

                {/* The column the screen exists for, so it carries the weight —
                    and it is the SERVER's `total - paidAmount`, not a subtraction
                    done here against two strings. */}
                <TableCell
                  className={cn(
                    "text-right tabular-nums text-sm font-semibold",
                    isPositive(invoice.outstandingAmount) && "text-danger",
                  )}
                >
                  {formatMoney(invoice.outstandingAmount)}
                </TableCell>

                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>

                <TableCell className="text-right whitespace-nowrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Aksi ${invoice.invoiceNumber}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem asChild>
                        <Link href={href}>Lihat detail</Link>
                      </DropdownMenuItem>
                      {canPay &&
                        invoice.status !== "paid" &&
                        isPositive(invoice.payableAmount) && (
                          <DropdownMenuItem onSelect={() => onPay(invoice)}>
                            Bayar
                          </DropdownMenuItem>
                        )}
                      {canReceive && stillToCome && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/dashboard/purchasing/receipts/new?invoice=${invoice._id}`}
                          >
                            Buat penerimaan barang
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
