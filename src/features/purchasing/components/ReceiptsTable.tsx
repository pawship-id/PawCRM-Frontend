"use client";

import Link from "next/link";

import { HighlightText } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/utils/decimal";
import type { GoodsReceiptListRow } from "@/types/api";

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
 * The goods-receipt list table.
 *
 * READ-ONLY, AND THAT IS THE WHOLE SHAPE OF IT. There is no actions column, no
 * dropdown and no ConfirmDialog — unlike SuppliersTable — because a posted
 * receipt has nothing to act on: the API offers no update and no delete, since
 * the delivery has already raised stock, created lots and moved the weighted
 * average. Every row leads to one place, its detail.
 *
 * THE FAKTUR COLUMN IS WHERE THE TWO PURCHASE TYPES VISIBLY DIVERGE, and it is
 * the fastest way to answer "why does this delivery not appear in my payables"
 * without opening anything. It is NOT, however, a debt indicator: a `beli_putus`
 * receipt credits `2101 Utang Supplier` the moment it posts, and `invoiceId`
 * stays null until the vendor's own bill is filed against it. The column says
 * whether the supplier's document has arrived, not whether money is owed — which
 * is why the empty state reads "belum difakturkan" rather than "tanpa utang".
 */
export function ReceiptsTable({
  receipts,
  loading,
  search,
}: {
  receipts: GoodsReceiptListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
}) {
  if (!loading && receipts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada penerimaan yang cocok dengan filter ini.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Catat barang masuk — penerimaan inilah yang membentuk HPP.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table className={loading ? "opacity-60" : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Nomor</TableHead>
            <TableHead>Tanggal</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Gudang</TableHead>
            <TableHead>Jenis</TableHead>
            <TableHead className="text-right">Item</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
            <TableHead>Faktur</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((receipt) => (
            <TableRow key={receipt._id}>
              <TableCell className="font-mono text-xs">
                <Link
                  href={`/dashboard/purchasing/receipts/${receipt._id}`}
                  className="text-primary-hover hover:underline"
                >
                  <HighlightText text={receipt.receiptNumber} query={search} />
                </Link>
              </TableCell>

              <TableCell className="text-xs">
                {formatDate(receipt.receiptDate)}
              </TableCell>

              <TableCell className="text-sm font-medium">
                {receipt.supplierName ?? "—"}
              </TableCell>

              <TableCell className="text-xs text-muted">
                {receipt.warehouseName ?? "—"}
              </TableCell>

              <TableCell>
                <SupplierTypeBadge type={receipt.purchaseType} />
              </TableCell>

              <TableCell className="text-right font-mono text-xs tabular-nums">
                {receipt.itemCount}
              </TableCell>

              {/* `grandTotal` — what the supplier is owed, tax included. The
                  ex-tax `total` is on the detail, where the split is the point. */}
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {formatMoney(receipt.grandTotal)}
              </TableCell>

              <TableCell>
                {receipt.invoiceId ? (
                  <Link
                    href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}
                    className="font-mono text-xs text-primary-hover hover:underline"
                  >
                    Lihat faktur
                  </Link>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-secondary/25 text-secondary-foreground"
                  >
                    {receipt.purchaseType === "konsinyasi"
                      ? "tanpa faktur"
                      : "belum difakturkan"}
                  </Badge>
                )}
              </TableCell>

              <TableCell className="text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/purchasing/receipts/${receipt._id}`}>
                    Detail
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
