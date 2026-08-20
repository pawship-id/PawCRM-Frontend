"use client";

import { Pagination } from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, multiplyDecimals, toMinor } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

import { ExpiryBadge } from "./ExpiryBadge";

/**
 * Every lot the current filters match, in the order the API returns them.
 *
 * NOT RE-SORTED HERE. The list arrives closest-to-expiring first with the
 * no-expiry lots last, which is a server-side ordering across the whole
 * collection — and with the rows paged, a client that re-sorted would only be
 * reordering the twenty it happens to hold, producing a sequence that changes
 * meaning at every page boundary.
 *
 * The product and warehouse names arrive ON THE ROW. This screen spans the whole
 * catalogue, so a client resolving them itself would need all of it in memory,
 * and one holding part of it would render blanks for the rest.
 */
export function BatchesTable({
  batches,
  page,
  totalPages,
  total,
  searching,
  onPageChange,
}: {
  batches: ProductBatch[];
  page: number;
  totalPages: number;
  total: number;
  /** Changes the empty copy: nothing found reads differently from nothing due. */
  searching: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Kode batch</th>
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-left font-medium">Kedaluwarsa</th>
              <th className="px-4 py-2.5 text-right font-medium">Sisa / awal</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Harga beli lot
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai sisa</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    {searching
                      ? "Tidak ada batch yang cocok"
                      : "Tidak ada batch di rentang ini"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {searching
                      ? "Coba potongannya saja — pencarian mencocokkan sebagian kode batch, nama produk, atau SKU."
                      : "Longgarkan rentangnya, atau pilih gudang lain."}
                  </p>
                </td>
              </tr>
            )}

            {batches.map((batch) => {
              const remaining = toMinor(batch.qtyRemaining) ?? 0n;
              const spent = remaining === 0n;

              return (
                <tr
                  key={batch._id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    spent && "opacity-55",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="tabular-nums text-xs">{batch.batchCode}</span>
                    {batch.isConsignment && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-transparent bg-secondary/25 text-secondary-foreground"
                      >
                        konsinyasi
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {/* Null when the product was deleted after the lot was
                        written — the API still names it wherever it can. */}
                    <p className="text-sm font-medium">
                      {batch.productName ?? "—"}
                    </p>
                    <p className="tabular-nums text-xs text-muted">
                      {batch.productSku}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {batch.warehouseName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {batch.expiryDate ? (
                      <ExpiryBadge date={batch.expiryDate} />
                    ) : (
                      <span className="text-xs text-muted">tanpa expiry</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums text-sm",
                      // A withdrawal outran this lot. The row that needs fixing
                      // must not look like the rows that do not.
                      remaining < 0n && "font-semibold text-danger",
                    )}
                  >
                    {formatQty(batch.qtyRemaining)}
                    <span className="text-xs text-muted">
                      {" "}
                      / {formatQty(batch.initialQty)}
                    </span>
                    {batch.productUnit && (
                      <span className="text-xs text-muted">
                        {" "}
                        {batch.productUnit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted">
                    {formatMoney(batch.costPerUnit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {spent
                      ? "—"
                      : formatMoney(
                          multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
                        )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Batch dibuat otomatis saat barang masuk untuk produk yang punya masa
          kedaluwarsa, atau yang datang sebagai konsinyasi. Urutannya sekaligus
          urutan pengambilan: <b>yang paling dekat kedaluwarsa keluar duluan</b>.
        </p>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        unit="batch"
        unitPlural="batch"
        onPageChange={onPageChange}
      />
    </div>
  );
}
