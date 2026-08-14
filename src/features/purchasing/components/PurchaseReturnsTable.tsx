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
import { usePermissions } from "@/features/permissions";
import { formatMoney } from "@/utils/decimal";
import type { PurchaseReturnListRow } from "@/types/api";

import { PurchaseReturnStatusBadge } from "./PurchaseReturnStatusBadge";

/** `2026-08-06T…` → `06 Agu 2026`. The only date format this module shows. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * The purchase-return list table.
 *
 * UNLIKE ReceiptsTable, THIS ONE HAS ROW ACTIONS — because a return, unlike a
 * delivery, has a life before it is posted. A draft can be continued or
 * discarded; a submitted return can only be read. The action column says which,
 * and the two verbs differ for exactly that reason: "Lanjutkan" is an invitation
 * to finish something, "Lihat" is not.
 *
 * THE VALUE COLUMN IS NEGATIVE-CODED. Money on this screen is money coming OFF a
 * supplier's payable and stock coming OFF the shelf, so it is rendered in the
 * danger colour throughout. A return that reads like a purchase is one somebody
 * will add to the wrong side of a reconciliation.
 *
 * A DRAFT'S VALUE IS PROVISIONAL and the column does not pretend otherwise: the
 * server recomputes every line against the live receipt at submit, so a draft
 * opened this morning can be worth something different this afternoon if another
 * return against the same delivery landed in between. That is why the total is
 * muted for a draft and solid for a final one.
 */
export function PurchaseReturnsTable({
  returns,
  loading,
  search,
  onDiscard,
}: {
  returns: PurchaseReturnListRow[];
  loading: boolean;
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
  /** Opens the confirmation. Undefined hides the control entirely. */
  onDiscard?: (row: PurchaseReturnListRow) => void;
}) {
  const { can } = usePermissions();

  if (!loading && returns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada retur yang cocok dengan filter ini.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Retur selalu dibuat dari penerimaan yang sudah tercatat, supaya harga
          beli aslinya ikut terbawa.
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
            <TableHead>Penerimaan asal</TableHead>
            <TableHead>Gudang</TableHead>
            <TableHead className="text-right">Item</TableHead>
            <TableHead className="text-right">Nilai retur</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {returns.map((row) => {
            const isDraft = row.status === "draft";

            return (
              <TableRow key={row._id}>
                <TableCell className="tabular-nums text-xs">
                  <Link
                    href={`/dashboard/purchasing/returns/${row._id}`}
                    className="text-primary-hover hover:underline"
                  >
                    <HighlightText text={row.returnNumber} query={search} />
                  </Link>
                </TableCell>

                <TableCell className="text-xs">
                  {formatDate(row.returnDate)}
                </TableCell>

                <TableCell className="text-sm font-medium">
                  {row.supplierName ?? "—"}
                </TableCell>

                {/* The delivery being reversed, named rather than referenced —
                    the column this list is actually scanned by. */}
                <TableCell className="tabular-nums text-xs">
                  <Link
                    href={`/dashboard/purchasing/receipts/${row.originalReceiptId}`}
                    className="text-primary-hover hover:underline"
                  >
                    {row.originalReceiptNumber ?? "—"}
                  </Link>
                </TableCell>

                <TableCell className="text-xs text-muted">
                  {row.warehouseName ?? "—"}
                </TableCell>

                <TableCell className="text-right tabular-nums text-xs">
                  {row.itemCount}
                </TableCell>

                <TableCell
                  className={
                    isDraft
                      ? "text-right tabular-nums text-sm text-muted"
                      : "text-right tabular-nums text-sm font-semibold text-danger"
                  }
                >
                  {formatMoney(row.totalAmount)}
                </TableCell>

                <TableCell>
                  <PurchaseReturnStatusBadge status={row.status} />
                </TableCell>

                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/purchasing/returns/${row._id}`}>
                      {isDraft ? "Lanjutkan" : "Lihat"}
                    </Link>
                  </Button>

                  {/* Drafts only — the API refuses to discard a submitted
                      return, which is the supporting document for movements and
                      a journal entry that cannot be undone. */}
                  {isDraft && onDiscard && can("purchaseReturns", "delete") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => onDiscard(row)}
                    >
                      Buang
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
