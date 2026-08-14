"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { productBatchService } from "@/services/productBatch.service";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { ConsignmentProductRow } from "@/types/api";

/**
 * Which of a supplier's goods are still on the shelf.
 *
 * SHARED BY TWO SCREENS deliberately: the supplier detail passes a
 * `supplierId`, the consignment report drills into one without leaving. The
 * alternative — a table per screen — is two ideas of what "still here" means,
 * and they would disagree the first time either changed.
 *
 * FETCHES ITS OWN DATA rather than taking rows as a prop, because both callers
 * want exactly this query and neither has the rows already. A caller that
 * eventually does can be given a `rows` prop then; inventing one now would be a
 * parameter with no second caller to justify it.
 */
export function ConsignmentProductsTable({
  supplierId,
  showSupplier = false,
}: {
  /** Omit for every vendor — the report's cross-supplier view. */
  supplierId?: string;
  /** Adds a Supplier column. Off on a screen already about one vendor. */
  showSupplier?: boolean;
}) {
  const [rows, setRows] = useState<ConsignmentProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .consignmentProducts({ supplierId })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar produk titipan gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supplierId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted">
        <Spinner /> Memuat produk titipan…
      </div>
    );
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-sm text-muted">
        Tidak ada barang titipan di gudang saat ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showSupplier && <TableHead>Supplier</TableHead>}
            <TableHead>SKU</TableHead>
            <TableHead>Produk</TableHead>
            <TableHead className="text-right">Sisa</TableHead>
            <TableHead className="text-right">Lot</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
            <TableHead>Kedaluwarsa terdekat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.supplierId}-${row.productId}`}>
              {showSupplier && (
                <TableCell className="text-xs">
                  {row.supplierName ?? (
                    <span className="text-muted">Supplier sudah dihapus</span>
                  )}
                </TableCell>
              )}
              <TableCell className="tabular-nums text-xs">
                {row.sku ?? "—"}
              </TableCell>
              <TableCell>
                <Link
                  href={`/dashboard/inventory/products/${row.productId}`}
                  className="hover:underline"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQty(row.qtyRemaining)}{" "}
                <span className="text-xs text-muted">{row.unit}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted">
                {row.lotCount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.value)}
              </TableCell>
              <TableCell className="text-xs">
                {/*
                  An em dash, not a date. Null is the ordinary case for dry
                  goods and is NOT "expires today" — the two lead to different
                  conversations with the vendor, so the absence is shown.
                */}
                {row.nearestExpiry ? (
                  <span className={cn(isSoon(row.nearestExpiry) && "text-destructive")}>
                    {row.nearestExpiry.slice(0, 10)}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Within thirty days — the same horizon the expiry alert uses, so a lot flagged
 * here is the same lot flagged there.
 *
 * Consigned goods are where this matters most: they are the supplier's until
 * they sell, so an expiry is a conversation to have BEFORE it passes rather than
 * a write-off to absorb after.
 */
function isSoon(iso: string): boolean {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return days <= 30;
}
