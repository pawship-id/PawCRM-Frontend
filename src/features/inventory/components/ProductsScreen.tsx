"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";

import { Breadcrumb } from "@/components";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type { Product, ProductType } from "@/types/inventory";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { ProductTypeBadge } from "./ProductTypeBadge";

const TYPE_FILTERS: Array<{ value: ProductType | "all"; label: string }> = [
  { value: "all", label: "Semua tipe" },
  { value: "standalone", label: "Standalone" },
  { value: "parent", label: "Punya varian" },
  { value: "bundle", label: "Bundle" },
];

/**
 * The catalogue list: standalone products, variant families, and bundles.
 *
 * VARIANTS ARE NESTED, NOT LISTED. A tenant with six sizes × two flavours has
 * twelve rows for one product, and a flat list buries every other product under
 * them. The parent is one row that expands, which is also how the POS shows it —
 * so the screen a manager edits and the screen a cashier sells from agree about
 * what "a product" is.
 *
 * The stock column reads differently per type, and that is the honest rendering
 * rather than a missing feature:
 *   parent — the SUM of its variants, because the parent holds none itself;
 *   bundle — how many can be BUILT from the components on hand, since a bundle
 *            keeps no stock of its own;
 *   others — the quantity actually on the shelf.
 */
export function ProductsScreen() {
  const { products, categories, warehouses, sync } = useInventoryDemo();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<ProductType | "all">("all");
  const [categoryId, setCategoryId] = useState("all");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]._id);
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Top-level rows only — variants surface through their parent. */
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => product.productType !== "variant")
      .filter((product) => type === "all" || product.productType === type)
      .filter((product) => categoryId === "all" || product.categoryId === categoryId)
      .filter((product) => {
        if (!query) return true;
        const own =
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query) ||
          (product.barcode ?? "").includes(query);
        // A search that matches a VARIANT must surface its parent, or the
        // product appears to be missing from the catalogue entirely.
        const child = demo
          .variantsOf(product._id)
          .some(
            (variant) =>
              variant.name.toLowerCase().includes(query) ||
              variant.sku.toLowerCase().includes(query) ||
              (variant.barcode ?? "").includes(query),
          );
        return own || child;
      });
    // `products` is a fresh array on every store sync, so it already carries the
    // write signal — no separate version counter is needed here.
  }, [products, search, type, categoryId]);

  function stockOf(product: Product): string {
    if (product.productType === "bundle") {
      return demo.bundleAvailability(product._id, warehouseId);
    }
    if (product.productType === "parent") {
      const total = demo
        .variantsOf(product._id)
        .reduce<bigint>(
          (acc, variant) => acc + (toMinor(demo.qtyOnHand(variant._id, warehouseId)) ?? 0n),
          0n,
        );
      return String(total / 10_000n);
    }
    return demo.qtyOnHand(product._id, warehouseId);
  }

  function priceOf(product: Product): string | null {
    if (product.productType === "bundle") return demo.bundlePrice(product._id);
    return product.sellPrice;
  }

  function hppOf(product: Product): string | null {
    if (product.productType === "bundle") return demo.bundleHpp(product._id);
    return product.hppAvg;
  }

  /**
   * Deleting is guarded, and the refusal is the useful path.
   *
   * A product that has ever moved stock is deactivated rather than removed:
   * deleting it would leave stock-card rows pointing at something no report can
   * name. The store returns the REASON so the toast can say which of the three
   * guards refused, rather than a generic failure the user cannot act on.
   */
  function handleDelete(product: Product) {
    const result = demo.deleteProduct(product._id);

    if (!result.ok) {
      swalToast(result.reason ?? "Tidak bisa dihapus.");
      return;
    }

    sync();
    swalToast(`${product.name} dihapus.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Produk & Varian" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Produk &amp; Varian
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Produk biasa, produk dengan varian dua tingkat (ukuran × rasa), dan
            bundle. Produk induk tidak menyimpan stok — stoknya ada di varian.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/dashboard/inventory/products/new?type=bundle">+ Bundle</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/inventory/products/new">+ Produk baru</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cari nama, SKU, atau barcode…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
          aria-label="Cari produk"
        />

        <Select value={type} onValueChange={(value) => setType(value as ProductType | "all")}>
          <SelectTrigger className="w-40" aria-label="Filter tipe">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-44" aria-label="Filter kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category._id} value={category._id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Stok ditampilkan untuk
          </span>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-52" aria-label="Gudang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {warehouses
                .filter((warehouse) => warehouse.isActive)
                .map((warehouse) => (
                  <SelectItem key={warehouse._id} value={warehouse._id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-left font-medium">Kategori</th>
              <th className="px-4 py-2.5 text-right font-medium">HPP</th>
              <th className="px-4 py-2.5 text-right font-medium">Harga jual</th>
              <th className="px-4 py-2.5 text-right font-medium">Stok</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">Tidak ada produk cocok</p>
                  <p className="mt-1 text-sm text-muted">
                    Ubah kata kunci atau filternya.
                  </p>
                </td>
              </tr>
            )}

            {rows.map((product) => {
              const variants = demo.variantsOf(product._id);
              const isOpen = expanded === product._id;
              const stock = stockOf(product);
              const low =
                product.productType === "standalone" &&
                product.minStock > 0 &&
                (toMinor(stock) ?? 0n) <= BigInt(product.minStock) * 10_000n;

              return (
                <Fragment key={product._id}>
                  <tr className="border-b border-border/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {variants.length > 0 && (
                          <button
                            type="button"
                            aria-label={isOpen ? "Tutup varian" : "Lihat varian"}
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? null : product._id)}
                            className="flex size-5 items-center justify-center rounded text-muted hover:bg-accent hover:text-foreground"
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        )}
                        <div className={cn(variants.length === 0 && "pl-7")}>
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
                            product.productType === "parent" ? variants.length : undefined
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
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {categories.find((c) => c._id === product.categoryId)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {product.productType === "parent" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatMoney(hppOf(product))
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {formatMoney(priceOf(product))}
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
                          <span className="ml-1 text-[11px] text-muted">bisa dibuat</span>
                          {/* The cap is rarely the component the user is
                              looking at, so it is named rather than left to be
                              worked out from the component list. */}
                          {(() => {
                            const limiting = demo.bundleLimitedBy(
                              product._id,
                              warehouseId,
                            );
                            return limiting ? (
                              <span className="block text-[11px] font-normal text-muted">
                                dibatasi {limiting.name}
                              </span>
                            ) : null;
                          })()}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/inventory/products/${product._id}`}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => handleDelete(product)}
                      >
                        Hapus
                      </Button>
                    </td>
                  </tr>

                  {isOpen &&
                    variants.map((variant) => {
                      const variantStock = demo.qtyOnHand(variant._id, warehouseId);
                      const variantLow =
                        variant.minStock > 0 &&
                        (toMinor(variantStock) ?? 0n) <= BigInt(variant.minStock) * 10_000n;

                      return (
                        <tr
                          key={variant._id}
                          className="border-b border-border/60 bg-accent/30"
                        >
                          <td className="py-2.5 pl-16 pr-4">
                            <p className="text-sm">
                              {Object.values(variant.variantAttributes ?? {}).join(" / ")}
                            </p>
                            <p className="font-mono text-xs text-muted">
                              {variant.sku}
                              {variant.barcode && ` · ⦀ ${variant.barcode}`}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            <ProductTypeBadge type="variant" />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted">↳ ikut induk</td>
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
    </div>
  );
}
