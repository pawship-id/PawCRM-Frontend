"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

import { ConfirmDialog } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type { Category } from "@/types/api";
import type { Product } from "@/types/inventory";

import { useProductVariants } from "../hooks/useProductVariants";
import { limitedByAt, qtyAt, stockOf } from "../utils/catalogue";
import { ProductTypeBadge } from "./ProductTypeBadge";

/**
 * The catalogue table: one row per family, expandable to its variants.
 *
 * VARIANTS ARE NESTED, NOT LISTED — the same shape the POS shows, so the screen
 * a manager edits and the screen a cashier sells from agree about what "a
 * product" is. The list request excludes them (see useProducts) and each
 * parent's own variants are fetched when its row is opened.
 *
 * Every number in the Stok column is computed by the backend and read here, not
 * derived: a parent reports its variants' total, a bundle how many it can build,
 * everything else what is on the shelf. See utils/catalogue.
 */
export function ProductsTable({
  products,
  categories,
  warehouseId,
  loading,
  onChanged,
}: {
  products: Product[];
  categories: Category[];
  warehouseId: string;
  loading: boolean;
  onChanged: () => void;
}) {
  const variants = useProductVariants();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    product: Product;
    action: "delete" | "restore";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  /**
   * Product id → name, for everything on screen: the page's rows plus any
   * variants an expand has loaded. Used to name a bundle's limiting component
   * without asking the server for a word.
   */
  const namesById = new Map<string, string>();
  products.forEach((product) => namesById.set(product._id, product.name));
  Object.values(variants.byParent).forEach((rows) =>
    rows.forEach((variant) => namesById.set(variant._id, variant.name)),
  );

  function toggle(product: Product) {
    const isOpen = expanded === product._id;
    setExpanded(isOpen ? null : product._id);
    if (!isOpen) variants.load(product._id);
  }

  /**
   * Delete and restore, both guarded server-side and both reported verbatim.
   *
   * A product that has ever moved stock, is consumed by a bundle, or still has
   * variants comes back 409 with a message naming WHICH guard refused and what
   * to do instead ("deactivate it"). Rewording that into "could not delete"
   * would throw away the only part the user can act on.
   */
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setDialogError(null);

    try {
      if (pending.action === "delete") {
        await productService.remove(pending.product._id);
        swalToast(`${pending.product.name} dihapus.`);
      } else {
        await productService.restore(pending.product._id);
        swalToast(`${pending.product.name} dipulihkan.`);
      }
      variants.invalidate(pending.product._id);
      setPending(null);
      onChanged();
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Gagal. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-left font-medium">Kategori</th>
              <th className="px-4 py-2.5 text-right font-medium">HPP</th>
              <th className="px-4 py-2.5 text-right font-medium">Harga jual</th>
              <th className="px-4 py-2.5 text-right font-medium">Stok</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className={cn(loading && "opacity-60")}>
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Tidak ada produk cocok
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Ubah kata kunci atau filternya.
                  </p>
                </td>
              </tr>
            )}

            {products.map((product) => {
              const isOpen = expanded === product._id;
              const variantCount = product.variantCount ?? 0;
              const stock = stockOf(product, warehouseId);
              const deleted = Boolean(product.deletedAt);
              const low =
                product.productType === "standalone" &&
                product.minStock > 0 &&
                (toMinor(stock) ?? 0n) <= BigInt(product.minStock) * 10_000n;

              return (
                <Fragment key={product._id}>
                  <tr
                    className={cn(
                      "border-b border-border/60",
                      deleted && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {variantCount > 0 && (
                          <button
                            type="button"
                            aria-label={isOpen ? "Tutup varian" : "Lihat varian"}
                            aria-expanded={isOpen}
                            onClick={() => toggle(product)}
                            className="flex size-5 items-center justify-center rounded text-muted hover:bg-accent hover:text-foreground"
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        )}
                        <div className={cn(variantCount === 0 && "pl-7")}>
                          <p className="font-medium">{product.name}</p>
                          <p className="font-mono text-xs text-muted">
                            {product.sku}
                            {product.barcode && ` · ⦀ ${product.barcode}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <ProductTypeBadge
                          type={product.productType}
                          variantCount={
                            product.productType === "parent"
                              ? variantCount
                              : undefined
                          }
                        />
                        {product.hasExpiry && (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-secondary/25 text-secondary-foreground"
                          >
                            expiry
                          </Badge>
                        )}
                        {!product.isActive && (
                          <Badge variant="outline">nonaktif</Badge>
                        )}
                        {deleted && <Badge variant="outline">terhapus</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {categories.find((c) => c._id === product.categoryId)
                        ?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {product.productType === "parent" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatMoney(product.hppAvg)
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {formatMoney(product.sellPrice)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
                        low && "font-semibold text-danger",
                      )}
                    >
                      {formatQty(stock)}
                      {product.productType === "bundle" && (
                        <>
                          <span className="ml-1 text-[11px] text-muted">
                            bisa dibuat
                          </span>
                          {/* The cap is rarely the component the user is looking
                              at, so it is named rather than left to be worked
                              out from the component list. */}
                          <LimitedBy
                            product={product}
                            warehouseId={warehouseId}
                            names={namesById}
                          />
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {deleted ? (
                        <Can feature="products" action="restore">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPending({ product, action: "restore" })
                            }
                          >
                            Pulihkan
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can feature="products" action="update">
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/dashboard/inventory/products/${product._id}`}
                              >
                                Edit
                              </Link>
                            </Button>
                          </Can>
                          <Can feature="products" action="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() =>
                                setPending({ product, action: "delete" })
                              }
                            >
                              Hapus
                            </Button>
                          </Can>
                        </>
                      )}
                    </td>
                  </tr>

                  {isOpen && variants.loading[product._id] && (
                    <tr className="border-b border-border/60 bg-accent/30">
                      <td colSpan={7} className="px-4 py-3 pl-16 text-xs text-muted">
                        Memuat varian…
                      </td>
                    </tr>
                  )}

                  {isOpen && variants.errors[product._id] && (
                    <tr className="border-b border-border/60 bg-accent/30">
                      <td colSpan={7} className="px-4 py-3 pl-16 text-xs text-danger">
                        {variants.errors[product._id]}
                      </td>
                    </tr>
                  )}

                  {isOpen &&
                    (variants.byParent[product._id] ?? []).map((variant) => {
                      const variantStock = qtyAt(
                        variant.stockByWarehouse,
                        warehouseId,
                      );
                      const variantLow =
                        variant.minStock > 0 &&
                        (toMinor(variantStock) ?? 0n) <=
                          BigInt(variant.minStock) * 10_000n;

                      return (
                        <tr
                          key={variant._id}
                          className="border-b border-border/60 bg-accent/30"
                        >
                          <td className="py-2.5 pr-4 pl-16">
                            <p className="text-sm">
                              {Object.values(
                                variant.variantAttributes ?? {},
                              ).join(" / ")}
                            </p>
                            <p className="font-mono text-xs text-muted">
                              {variant.sku}
                              {variant.barcode && ` · ⦀ ${variant.barcode}`}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            <ProductTypeBadge type="variant" />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted">
                            ↳ ikut induk
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                            {formatMoney(variant.hppAvg)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                            {formatMoney(variant.sellPrice)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
                              variantLow && "font-semibold text-danger",
                            )}
                          >
                            {formatQty(variantStock)}
                          </td>
                          <td className="px-4 py-2.5" />
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title={
            pending.action === "delete" ? "Hapus produk?" : "Pulihkan produk?"
          }
          confirmLabel={pending.action === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending.action === "delete"}
          busy={busy}
          error={dialogError}
          onConfirm={confirm}
          onCancel={() => {
            setPending(null);
            setDialogError(null);
          }}
        >
          {pending.action === "delete" ? (
            <>
              <b>{pending.product.name}</b> akan dihapus. Produk yang pernah
              punya stok, dipakai bundle, atau masih punya varian akan ditolak —
              nonaktifkan saja kalau begitu.
            </>
          ) : (
            <>
              <b>{pending.product.name}</b> akan dikembalikan ke katalog. Bisa
              ditolak kalau SKU atau barcode-nya sudah dipakai produk lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/**
 * Which component caps this bundle, named.
 *
 * The API answers with the component's id; the name comes from whatever is
 * already on screen — the page's own rows and any expanded variants. A bundle
 * whose limiting component is not on this page renders NOTHING rather than
 * "dibatasi <id>", because an id tells the user less than silence does. Fetching
 * it would be one request per bundle row to add one word.
 */
function LimitedBy({
  product,
  warehouseId,
  names,
}: {
  product: Product;
  warehouseId: string;
  names: Map<string, string>;
}) {
  const limitedBy = limitedByAt(product, warehouseId);
  const name = limitedBy ? names.get(String(limitedBy)) : undefined;
  if (!name) return null;

  return (
    <span className="block text-[11px] font-normal text-muted">
      dibatasi {name}
    </span>
  );
}
