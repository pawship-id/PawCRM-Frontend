"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  toMinor,
} from "@/utils/decimal";
import type { Product } from "@/types/inventory";

import { qtyIn } from "../utils/catalogue";

/**
 * The stock-card index: one row per stock-holding product, at one warehouse or
 * across all of them.
 *
 * FLAT, AND THAT IS THE DIFFERENCE FROM THE CATALOGUE. ProductsTable shows one
 * row per family with the variants folded behind a chevron, because a page of
 * twenty would otherwise be one product in twelve sizes. Here the variant IS the
 * row: a stock card is written per (product, warehouse) pair and a parent has
 * none, so folding them away would hide exactly the rows this screen exists to
 * open. Nothing is lost by flattening them — the backend names a variant
 * `<parent> — <ukuran> / <rasa>`, so the row says which product it belongs to
 * without a lookup.
 *
 * THE NUMBERS BELONG TO THE CHOSEN WAREHOUSE, or to all of them. `warehouseId`
 * empty is "semua gudang" — the repo's unset convention for a scope — and then
 * every figure is a TOTAL across locations. A product with no row at a chosen
 * location reads 0: the backend writes no stock row until the first movement, so
 * "never traded here" and "traded down to nothing" are the same statement on a
 * stock card.
 *
 * "ALL OF THEM" MEANS ALL OF THE USER'S, AND THE SERVER SAYS WHICH. Every
 * quantity on a product is per warehouse, and a warehouse is something an
 * account may or may not reach — so `GET /api/products` narrows
 * `stockByWarehouse` to the caller's own shelves before it answers
 * (PawCRM-Backend, `#stockScope`). What arrives here is already theirs, so this
 * table adds up the array exactly as it comes.
 *
 * IT IS NOT RE-FILTERED HERE, deliberately. The narrowing was briefly done on
 * this side, back when the API sent every location to everyone; a second copy of
 * the rule over the same number can only ever disagree with the first, and the
 * direction it would disagree in — hiding a shelf the account does reach — is
 * the one nobody would report as a bug. `utils/accessScope.ts` stays a courtesy
 * for PICKERS, which is a different job: not offering a choice that can only
 * 403.
 *
 * A TOTAL SAYS SO, on the row. Stock cannot be pooled across warehouses — twelve
 * split four ways is not twelve on any shelf — so a summed figure carries the
 * count of locations behind it, and the row opens on the one holding the most.
 * Without that note the total reads as a quantity somebody could go and pick.
 *
 * `minStock` IS NOT THIS WAREHOUSE'S, and the two sit in the same row. The
 * threshold is a property of the PRODUCT while the quantity beside it is one
 * shelf's, so a product merely stored somewhere else reads as low. The screen's
 * heading says which comparison is on screen; the badge says "menipis" rather
 * than claiming a shortage.
 *
 * BOTH LINKS IN A ROW GO TO THE SAME PLACE — the name and the trailing arrow.
 * That is the point of this screen: there is one thing to do with a row, and the
 * name is where people click first. The trailing link is what makes it
 * discoverable for anyone who does not think of a product name as a link, and it
 * carries the product's own accessible name so twenty of them are not twenty
 * identical "Kartu stok" links.
 *
 * The link carries `?warehouseId=` only when one is CHOSEN. Under "semua gudang"
 * there is no single shelf to name, so the card is left to pick — it opens on
 * the warehouse holding the most of that product, which is the closest thing to
 * the total the row was showing.
 */
export function StockProductsTable({
  products,
  warehouseId,
  search,
  loading,
}: {
  products: Product[];
  /**
   * Which warehouse the figures are for; "" is every one the API sent, which is
   * every one this account may read. See the header.
   */
  warehouseId: string;
  /** The live search term, highlighted in the columns it matched. */
  search: string;
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produk</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Stok</TableHead>
            <TableHead className="text-right">HPP</TableHead>
            <TableHead className="text-right">Nilai stok</TableHead>
            <TableHead className="text-right">Kartu stok</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody className={cn(loading && "opacity-60")}>
          {products.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={6} className="py-16 text-center">
                <p className="font-medium text-foreground">
                  Tidak ada produk cocok
                </p>
                <p className="mt-1 text-sm text-muted">
                  Ubah kata kunci atau filternya.
                </p>
              </TableCell>
            </TableRow>
          )}

          {products.map((product) => {
            // One id, or none at all — `qtyIn` reads an empty scope as every
            // warehouse, which is the same convention the catalogue uses. Every
            // row the API sent is already one this account may read, so "every
            // warehouse" and "every warehouse of theirs" are the same set here.
            const rows = product.stockByWarehouse;
            const qty = qtyIn(rows, warehouseId ? [warehouseId] : []);
            // How many locations that figure came from. Only interesting when
            // it came from more than one: "12" and "12, across three shelves"
            // are different answers to "can I pick twelve today".
            const spread = warehouseId
              ? 0
              : rows.filter((row) => (toMinor(row.qty) ?? 0n) !== 0n).length;
            const deleted = Boolean(product.deletedAt);
            // The `minStock > 0` guard is load-bearing: zero means "no threshold
            // set", and without it every product with no stock and no threshold
            // reads as being below one.
            const low =
              product.minStock > 0 &&
              (toMinor(qty) ?? 0n) <= BigInt(product.minStock) * 10_000n;
            const value = product.hppAvg
              ? multiplyDecimals(qty, product.hppAvg)
              : null;
            const href = warehouseId
              ? `/dashboard/inventory/stock-card/${product._id}?warehouseId=${warehouseId}`
              : `/dashboard/inventory/stock-card/${product._id}`;

            return (
              <TableRow
                key={product._id}
                className={cn(deleted && "opacity-60")}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {/* The thumbnail, resolved: a variant with no image of its
                        own shows its parent's, so a row is never a blank
                        square. */}
                    {product.resolved?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          product.resolved.image.thumbUrl ??
                          product.resolved.image.mediumUrl ??
                          product.resolved.image.url
                        }
                        alt=""
                        className="size-10 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <span className="size-10 shrink-0 rounded-md border border-dashed border-border" />
                    )}

                    <div>
                      <Link
                        href={href}
                        className="font-medium hover:text-primary-hover hover:underline"
                      >
                        <HighlightText text={product.name} query={search} />
                      </Link>
                      {(deleted || !product.isActive) && (
                        <p className="mt-0.5">
                          <Tag tone={deleted ? "danger" : "neutral"}>
                            {deleted ? "terhapus" : "nonaktif"}
                          </Tag>
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="tabular-nums text-xs text-muted">
                  {/* Every row here holds stock, so every row has a SKU — only a
                      parent may be without one, and parents are not listed. */}
                  <HighlightText text={product.sku ?? "—"} query={search} />
                </TableCell>

                <TableCell className="text-right">
                  <span
                    className={cn(
                      "tabular-nums",
                      low && "font-semibold text-danger",
                    )}
                  >
                    {formatQty(qty)}
                  </span>{" "}
                  <span className="text-xs text-muted">{product.unit}</span>
                  {spread > 1 && (
                    <p className="mt-0.5 text-xs text-muted">
                      di {spread} gudang
                    </p>
                  )}
                  {low && (
                    <p className="mt-0.5">
                      <Tag tone="danger">menipis · min {product.minStock}</Tag>
                    </p>
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {/* Null until the first valued receipt — "—" rather than 0,
                      which would claim the goods cost nothing. */}
                  {product.hppAvg ? formatMoney(product.hppAvg) : "—"}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {value ? formatMoney(value) : "—"}
                </TableCell>

                <TableCell className="text-right">
                  <Link
                    href={href}
                    aria-label={`Kartu stok ${product.name}`}
                    className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-primary hover:underline"
                  >
                    Kartu stok
                    <ArrowRight className="size-4" />
                  </Link>
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
 * A status word on a tinted pill — §9's one badge convention, inline until the
 * promoted `StatusBadge` exists. Always carries a word: the colour is never the
 * whole message.
 */
function Tag({
  tone,
  children,
}: {
  tone: "neutral" | "danger";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "danger"
          ? "bg-tint-danger text-danger-ink"
          : "bg-tint-neutral text-muted",
      )}
    >
      {children}
    </span>
  );
}
