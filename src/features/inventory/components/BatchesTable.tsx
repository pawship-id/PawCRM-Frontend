"use client";

import Link from "next/link";

import { HighlightText, Pagination } from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  toMinor,
} from "@/utils/decimal";
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
 *
 * THE BRANCH DOES NOT, and cannot: a lot has no branch of its own — it belongs to
 * a warehouse, and the warehouse carries the link. The screen holds both lookups
 * whole and hands the walk down as `branchOf`.
 */
export function BatchesTable({
  batches,
  branchOf,
  page,
  totalPages,
  total,
  search,
  onPageChange,
}: {
  batches: ProductBatch[];
  /**
   * The branch a lot's warehouse belongs to, already resolved and ready to
   * render — including the placeholders for a central warehouse and for a
   * lookup that has not landed. See `BatchesScreen`.
   */
  branchOf: (warehouseId: string) => string;
  page: number;
  totalPages: number;
  total: number;
  /**
   * The live search term. Highlighted in the three cells the backend actually
   * matches on — batch code, product name, SKU — so a row that surfaced for a
   * reason invisible at a glance says which characters put it there.
   *
   * Also changes the empty copy: nothing found reads differently from nothing due.
   */
  search: string;
  onPageChange: (page: number) => void;
}) {
  const searching = search.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">
                Kode batch internal
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-left font-medium">Cabang</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-left font-medium">Kedaluwarsa</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Sisa Stock
              </th>
              <th className="px-4 py-2.5 text-right font-medium">HPP</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai sisa</th>
              {/* No caption: the column holds one link per row and a header
                  over it would be a word describing a verb. */}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    {searching
                      ? "Tidak ada batch yang cocok"
                      : "Tidak ada batch di rentang ini"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {searching
                      ? "Coba potongannya saja — pencarian mencocokkan sebagian kode batch, nama produk, atau SKU."
                      : "Longgarkan rentangnya, atau pilih cabang atau gudang lain."}
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
                    <span className="tabular-nums text-xs">
                      <HighlightText text={batch.batchCode} query={search} />
                    </span>
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
                      <HighlightText
                        text={batch.productName ?? "—"}
                        query={search}
                      />
                    </p>
                    <p className="tabular-nums text-xs text-muted">
                      <HighlightText
                        text={batch.productSku ?? ""}
                        query={search}
                      />
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {branchOf(batch.warehouseId)}
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
                          multiplyDecimals(
                            batch.qtyRemaining,
                            batch.costPerUnit,
                          ),
                        )}
                  </td>
                  {/* THE OTHER HALF OF A UNIQUE CODE. Lot codes are unique so
                      that they can be scanned, and a code nothing can print is a
                      code nothing can scan. Offered on an exhausted lot too — a
                      label is reprinted for a carton that is still on a shelf,
                      and "sisa 0" and "gone" are not the same thing. */}
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/dashboard/inventory/batches/labels?ids=${batch._id}`}
                      className="text-xs font-medium underline"
                    >
                      Cetak label
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Batch dibuat otomatis saat barang masuk untuk produk yang punya masa
          kedaluwarsa, atau yang datang sebagai konsinyasi. Urutannya sekaligus
          urutan pengambilan: <b>yang paling dekat kedaluwarsa keluar duluan</b>
          .
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
