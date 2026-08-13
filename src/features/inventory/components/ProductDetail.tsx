"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import dynamic from "next/dynamic";

import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  sumDecimals,
  toMinor,
} from "@/utils/decimal";
import type { Category } from "@/types/api";
import type { Product, ProductStockRow } from "@/types/inventory";

import { useBundleCandidates } from "../hooks/useBundleCandidates";
import { useCatalogLookups } from "../hooks/useCatalogLookups";
import { useProductDetail } from "../hooks/useProductDetail";
import { limitedByAt, qtyIn } from "../utils/catalogue";
import type { WarehouseScope } from "../utils/catalogue";
import { ProductTypeBadge } from "./ProductTypeBadge";

/**
 * Read-only rich text. Lazily loaded and never server-rendered, for the same
 * reason the editor is: ProseMirror touches `document` while it constructs.
 */
const RichTextView = dynamic(
  () => import("@/components/RichTextEditor").then((m) => m.RichTextView),
  { ssr: false, loading: () => <p className="text-sm text-muted">Memuat…</p> },
);

/**
 * Sentinel for the "every warehouse" option — Radix Select forbids `""`.
 *
 * ONE WAREHOUSE AT A TIME HERE, unlike the catalogue list, which lets several be
 * ticked at once. This page is about one product, and the card below the figure
 * already breaks it down per location — the choice a list needs ("these two
 * branches, added up") is a question this screen answers by being read.
 */
const ALL = "all";

/** The single-warehouse selector, as the scope the shared helpers take. */
function scopeOf(warehouseId: string): WarehouseScope {
  return warehouseId === ALL ? [] : [warehouseId];
}

/**
 * "warisan dari induk" beside a value a variant did not set itself.
 *
 * WORTH THE PIXELS because the two states look identical otherwise. Somebody
 * reading a variant's 500 g has no way to tell whether that number was chosen
 * for this size or is following the family — and those answers lead to different
 * actions: one is edited here, the other on the parent, where it moves every
 * sibling at once.
 *
 * Renders nothing on a standalone, a parent or a bundle, whose `inheritedFields`
 * the API always returns empty.
 */
function InheritedNote({
  product,
  field,
}: {
  product: Product;
  field: string;
}) {
  if (!product.inheritedFields?.includes(field)) return null;

  return (
    <span className="ml-2 text-xs font-normal text-muted">
      warisan dari induk
    </span>
  );
}

/** "20 × 15 × 10 cm", or an em dash when the box was never measured. */
function formatDimensions(product: Product): string {
  const { length, width, height } = product.resolved?.shipping ?? {};

  // All three or none: two out of three describes no box, and rendering
  // "20 × 15 × —" invites somebody to read the gap as a zero.
  if (!length || !width || !height) return "—";

  return `${length} × ${width} × ${height} cm`;
}

/** "4101 — Penjualan", falling back to an em dash rather than a bare id. */
function accountLabel(
  accounts: Array<{ _id: string; code: string; name: string }>,
  accountId: string | null | undefined,
): string {
  if (!accountId) return "—";

  const account = accounts.find((candidate) => candidate._id === accountId);

  // An id nobody can resolve names nothing a human can look up, so it is not
  // shown — the same rule the stock ledger applies to `reference.id`.
  return account ? `${account.code} — ${account.name}` : "—";
}

/**
 * One product, read-only: everything stored about it, and — for a parent — every
 * variant under it with the stock each one holds.
 *
 * WHY THIS IS NOT THE EDIT FORM. The form asks "what should this product be" and
 * shows only the fields you may change: it hides stock entirely (an existing
 * product's quantity moves through the stock screens, never through a text
 * box), and a parent's variant table there is a grid of price inputs. This
 * screen asks the other question — "what IS this product, right now" — which is
 * the one somebody has when a till says a size is out of stock or a report shows
 * a margin they did not expect.
 *
 * THE STOCK NUMBER IS A DIFFERENT FIELD PER TYPE, and the screen never derives
 * one from another (see utils/catalogue):
 *
 *   standalone / variant — `stockByWarehouse`, what is on the shelf;
 *   parent               — `variantStock`, its variants' totals per warehouse,
 *                          because a parent holds nothing itself;
 *   bundle               — `bundleAvailability`, how many could be assembled.
 *
 * ONE WAREHOUSE SELECTOR SCOPES EVERY QUANTITY ON THE PAGE, defaulting to all of
 * them. Every response already carries the per-warehouse rows, so switching
 * location re-reads what is on screen rather than issuing a request — the same
 * arrangement the catalogue list uses, and for the same reason.
 */
export function ProductDetail({ productId }: { productId: string }) {
  const { product, variants, parent, loading, error } =
    useProductDetail(productId);
  // Inactive locations included: a closed warehouse still owns the stock it
  // held, and a row it appears in has to be named rather than shown as an id.
  // `withAccounting` resolves the two account references into names. Without it
  // the Akuntansi card could only print ObjectIds, which name nothing a human
  // can look up; the lists fail softly, so the card degrades to em dashes rather
  // than the screen failing.
  const lookups = useCatalogLookups({
    includeInactive: true,
    withAccounting: true,
  });
  // Only a bundle pays for this — it is the one type whose components are ids
  // the screen has to turn into names.
  const components = useBundleCandidates(product?.productType === "bundle");

  const [warehouseId, setWarehouseId] = useState(ALL);

  if (error) return <Alert variant="error">{error}</Alert>;

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat produk…
      </div>
    );
  }

  const rows = stockRowsOf(product);
  const stock = qtyIn(rows, scopeOf(warehouseId));
  const deleted = Boolean(product.deletedAt);
  const holdsStock =
    product.productType === "standalone" || product.productType === "variant";
  const scope =
    warehouseId === ALL
      ? "semua gudang"
      : (warehouseName(lookups.warehouses, warehouseId) ?? "gudang ini");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <ProductTypeBadge
              type={product.productType}
              variantCount={
                product.productType === "parent"
                  ? (product.variantCount ?? variants.length)
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
            {!product.isActive && <Badge variant="outline">nonaktif</Badge>}
            {deleted && <Badge variant="outline">terhapus</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs text-muted">
            {/* Null on a parent, which is never sold or scanned. */}
            {product.sku ?? "—"}
            {product.barcode && ` · ⦀ ${product.barcode}`}
          </p>
          {parent && (
            <p className="mt-1 text-sm text-muted">
              Varian dari{" "}
              <Link
                href={`/dashboard/inventory/products/${parent._id}`}
                className="font-medium text-foreground hover:text-primary-hover hover:underline"
              >
                {parent.name}
              </Link>
            </p>
          )}
        </div>

        {/* No "back to catalogue" here: the breadcrumb above the title already
            links there, and a second control saying the same thing competes
            with the one action this header exists for. */}
        <div className="ml-auto flex flex-wrap gap-2">
          {!deleted && (
            <Can feature="products" action="update">
              <Button variant="outline" asChild>
                <Link
                  href={`/dashboard/inventory/products/${product._id}/edit`}
                >
                  Ubah produk
                </Link>
              </Button>
            </Can>
          )}
        </div>
      </div>

      {deleted && (
        <Alert variant="info">
          Produk ini sudah dihapus. Datanya tetap utuh dan bisa dipulihkan dari
          katalog, tapi tidak muncul di POS maupun di form penerimaan barang.
        </Alert>
      )}

      {!product.isActive && !deleted && (
        <Alert variant="info">
          Produk ini nonaktif — tidak ditawarkan di POS dan tidak bisa dipilih
          sebagai komponen bundle baru. Stok dan riwayatnya tetap seperti apa
          adanya.
        </Alert>
      )}

      {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
          Angka stok untuk
        </span>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-56" aria-label="Gudang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua gudang</SelectItem>
            {lookups.warehouses.map((warehouse) => (
              <SelectItem key={warehouse._id} value={warehouse._id}>
                {warehouse.name}
                {!warehouse.isActive && " (nonaktif)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={stockLabel(product)}
          value={`${formatQty(stock)} ${product.unit}`}
          tone={isLow(product, stock) ? "danger" : "default"}
          hint={stockHint(product, scope)}
        />
        <Stat
          label="Harga jual"
          value={formatMoney(product.sellPrice)}
          hint={
            product.productType === "parent"
              ? "Harga ada di tiap varian"
              : product.bundleConfig?.pricingMode === "auto"
                ? "Dihitung dari komponen saat dijual"
                : undefined
          }
        />
        <Stat
          label="HPP rata-rata"
          value={formatMoney(product.hppAvg)}
          hint={
            product.productType === "parent" || product.productType === "bundle"
              ? "Melekat pada barang yang benar-benar disimpan"
              : product.hppAvg
                ? undefined
                : "Belum pernah ada penerimaan"
          }
        />
        <Stat
          label="Nilai stok"
          value={
            holdsStock && product.hppAvg
              ? formatMoney(multiplyDecimals(product.hppAvg, stock))
              : "—"
          }
          hint={holdsStock ? `HPP × stok di ${scope}` : "Tidak menyimpan stok"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card title="Informasi produk">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">SKU</dt>
              <dd className="font-mono text-xs">{product.sku ?? "—"}</dd>
              <dt className="text-muted">Barcode</dt>
              <dd className="font-mono text-xs">{product.barcode ?? "—"}</dd>
              <dt className="text-muted">Tipe</dt>
              <dd className="font-medium">
                {TYPE_LABELS[product.productType]}
              </dd>
              <dt className="text-muted">Merk</dt>
              <dd className="font-medium">
                {product.resolved?.brand ?? "—"}
                <InheritedNote product={product} field="brand" />
              </dd>
              <dt className="text-muted">Kategori</dt>
              <dd className="font-medium">
                {categoryName(lookups.categories, product.categoryId)}
              </dd>
              <dt className="text-muted">Satuan</dt>
              <dd className="font-medium">{product.unit}</dd>
              <dt className="text-muted">Minimum stok</dt>
              <dd className="font-mono tabular-nums">
                {product.minStock > 0
                  ? `${product.minStock} ${product.unit}`
                  : "—"}
              </dd>
              <dt className="text-muted">Kedaluwarsa</dt>
              <dd className="font-medium">
                {product.hasExpiry ? "Dicatat per batch" : "Tidak dicatat"}
              </dd>
              <dt className="text-muted">Pre-order</dt>
              <dd className="font-medium">
                {product.isPreorder ? "Ya" : "Tidak"}
              </dd>
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">
                {deleted ? "Terhapus" : product.isActive ? "Aktif" : "Nonaktif"}
              </dd>
            </dl>
          </Card>

          {/* The gallery. A product with no photos shows nothing rather than an
              empty frame — there is no state to explain, unlike shipping, where
              "unmeasured" is itself an answer a marketplace integration needs. */}
          {(product.media?.length ?? 0) > 0 && (
            <Card title="Foto & video">
              <div className="grid grid-cols-3 gap-2">
                {product.media?.map((item) => (
                  <a
                    key={item.storageKey}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden rounded-lg border border-border bg-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      // The 800px derivative, not the 320px thumbnail: this tile
                      // is a third of a card wide, where the thumb is visibly
                      // soft on a 2× screen. Narrows to what older media has.
                      src={
                        item.mediumUrl ??
                        item.thumbUrl ??
                        item.posterUrl ??
                        item.url
                      }
                      alt={item.alt ?? "Media produk"}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* Shown even when every field is empty, and deliberately: "no
              shipping information" is the answer a marketplace integration
              needs, and a card that disappeared when unset would read as a
              screen that forgot to render rather than as a product nobody has
              measured. */}
          <Card title="Informasi pengiriman">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Berat</dt>
              <dd className="font-mono tabular-nums">
                {product.resolved?.shipping.weight
                  ? `${product.resolved.shipping.weight} ${
                      product.resolved.shipping.weightUnit ?? "gr"
                    }`
                  : "—"}
                <InheritedNote product={product} field="shipping.weight" />
              </dd>
              <dt className="text-muted">Dimensi</dt>
              <dd className="font-mono tabular-nums">
                {formatDimensions(product)}
                <InheritedNote product={product} field="shipping.length" />
              </dd>
              <dt className="text-muted">Isi paket</dt>
              <dd>
                {product.resolved?.shipping.packageContents ?? "—"}
                <InheritedNote
                  product={product}
                  field="shipping.packageContents"
                />
              </dd>
            </dl>
          </Card>

          {/* Only when there is something to show: an empty description card is
              a heading with an em dash under it, which reads as a screen that
              failed rather than a product nobody has written up. */}
          {product.resolved?.description && (
            <Card title="Deskripsi">
              <RichTextView html={product.resolved.description} />
              <InheritedNote product={product} field="description" />
            </Card>
          )}

          <Card title="Akuntansi">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Akun penjualan</dt>
              <dd className="font-medium">
                {accountLabel(
                  lookups.salesAccounts,
                  product.resolved?.salesAccountId,
                )}
                <InheritedNote product={product} field="salesAccountId" />
              </dd>
              <dt className="text-muted">Lini bisnis</dt>
              <dd className="font-medium">
                {lookups.businessLines.find(
                  (line) => line._id === product.resolved?.businessLineId,
                )?.name ?? "—"}
                <InheritedNote product={product} field="businessLineId" />
              </dd>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Belum berpengaruh ke laporan mana pun — akan dipakai saat modul
              penjualan aktif.
            </p>
          </Card>

          {product.productType === "variant" &&
            product.variantAttributes &&
            Object.keys(product.variantAttributes).length > 0 && (
              <Card title="Atribut varian">
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                  {Object.entries(product.variantAttributes).map(
                    ([axis, value]) => (
                      <div key={axis} className="contents">
                        <dt className="text-muted">{axis}</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ),
                  )}
                </dl>
              </Card>
            )}

          {product.productType === "parent" && (
            <Card
              title="Sumbu varian"
              description="Kombinasi sumbu inilah yang membentuk varian di sebelah."
            >
              {product.variantAxes.length === 0 ? (
                <p className="text-sm text-muted">Belum ada sumbu varian.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {product.variantAxes.map((axis) => (
                    <div key={axis.name}>
                      <p className="text-xs font-medium text-muted">
                        {axis.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {axis.values.map((value) => (
                          <Badge key={value} variant="outline">
                            {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <StockByWarehouse
            product={product}
            rows={rows}
            warehouseId={warehouseId}
            warehouses={lookups.warehouses}
          />

          {product.productType === "parent" && (
            <VariantTable
              variants={variants}
              unit={product.unit}
              warehouseId={warehouseId}
              scope={scope}
            />
          )}

          {product.productType === "bundle" && (
            <BundleComponents
              product={product}
              candidates={components.products}
              loading={components.loading}
              error={components.error}
              warehouseId={warehouseId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

/**
 * Where the quantity actually is.
 *
 * A total is what a manager asks for and a location is what a shop assistant
 * acts on, so both are on the page: the tiles report the selected scope, this
 * table breaks it down. A warehouse the product has NO row at is absent rather
 * than listed as zero — absent means it has never been stocked there, which is a
 * different fact from having run out, and the backend draws the same
 * distinction.
 */
function StockByWarehouse({
  product,
  rows,
  warehouseId,
  warehouses,
}: {
  product: Product;
  rows: ProductStockRow[];
  warehouseId: string;
  warehouses: Array<{ _id: string; name: string }>;
}) {
  const visible =
    warehouseId === ALL
      ? rows
      : rows.filter((row) => String(row.warehouseId) === warehouseId);

  return (
    <Card
      title={
        product.productType === "bundle" ? "Bisa dibuat" : "Stok per gudang"
      }
      description={
        product.productType === "parent"
          ? "Jumlah seluruh varian di tiap gudang. Produk induk sendiri tidak menyimpan stok."
          : product.productType === "bundle"
            ? "Berapa bundle utuh yang bisa dirakit dari komponen yang ada di gudang itu. Tidak ada stok bundle yang benar-benar disimpan."
            : undefined
      }
    >
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Belum ada stok tercatat{warehouseId === ALL ? "" : " di gudang ini"}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                <th className="py-2 pr-4 text-left font-medium">Gudang</th>
                <th className="py-2 text-right font-medium">
                  {product.productType === "bundle" ? "Bisa dibuat" : "Stok"}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={String(row.warehouseId)}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-2 pr-4">
                    {warehouseName(warehouses, String(row.warehouseId)) ?? (
                      <span className="font-mono text-xs text-muted">
                        {String(row.warehouseId)}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-mono tabular-nums",
                      isLow(product, row.qty) && "font-semibold text-danger",
                    )}
                  >
                    {formatQty(row.qty)}{" "}
                    <span className="text-xs text-muted">{product.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {visible.length > 1 && (
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2 pr-4 text-xs text-muted">Total</td>
                  <td className="py-2 text-right font-mono font-semibold tabular-nums">
                    {formatQty(sumDecimals(visible.map((row) => row.qty)))}{" "}
                    <span className="text-xs font-normal text-muted">
                      {product.unit}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Every variant under this parent, with what each one holds.
 *
 * THE WHOLE FAMILY, NOT A PAGE OF IT — `GET /:id/variants` is unpaginated,
 * because a parent has a handful of variants by construction. Each row links to
 * its own detail page, since a variant is a product in its own right: it carries
 * the barcode, the price and the stock, and the parent carries none of them.
 */
function VariantTable({
  variants,
  unit,
  warehouseId,
  scope,
}: {
  variants: Product[];
  unit: string;
  warehouseId: string;
  scope: string;
}) {
  const total = sumDecimals(
    variants.map((variant) =>
      qtyIn(variant.stockByWarehouse, scopeOf(warehouseId)),
    ),
  );

  return (
    <Card
      title={`Varian (${variants.length})`}
      description={`Kolom stok dihitung untuk ${scope}.`}
    >
      {variants.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Produk induk ini belum punya varian. Tambahkan lewat “Ubah produk”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                <th className="py-2 pr-4 text-left font-medium">Varian</th>
                <th className="py-2 pr-4 text-right font-medium">HPP</th>
                <th className="py-2 pr-4 text-right font-medium">Harga jual</th>
                <th className="py-2 pr-4 text-right font-medium">Min</th>
                <th className="py-2 text-right font-medium">Stok</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => {
                const qty = qtyIn(
                  variant.stockByWarehouse,
                  scopeOf(warehouseId),
                );

                return (
                  <tr
                    key={variant._id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      variant.deletedAt && "opacity-60",
                    )}
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/dashboard/inventory/products/${variant._id}`}
                        className="font-medium hover:text-primary-hover hover:underline"
                      >
                        {Object.values(variant.variantAttributes ?? {}).join(
                          " / ",
                        ) || variant.name}
                      </Link>
                      <p className="font-mono text-xs text-muted">
                        {variant.sku}
                        {variant.barcode && ` · ⦀ ${variant.barcode}`}
                      </p>
                      {(!variant.isActive || variant.deletedAt) && (
                        <Badge variant="outline" className="mt-1">
                          {variant.deletedAt ? "terhapus" : "nonaktif"}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums">
                      {formatMoney(variant.hppAvg)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums">
                      {formatMoney(variant.sellPrice)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums">
                      {variant.minStock > 0 ? variant.minStock : "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right font-mono tabular-nums",
                        isLow(variant, qty) && "font-semibold text-danger",
                      )}
                    >
                      {formatQty(qty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={4} className="py-2 pr-4 text-xs text-muted">
                  Total stok varian
                </td>
                <td className="py-2 text-right font-mono font-semibold tabular-nums">
                  {formatQty(total)}{" "}
                  <span className="text-xs font-normal text-muted">{unit}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * What a bundle is made of, and which component is holding it back.
 *
 * The names come from the same list the bundle editor picks from, so a component
 * that has since been deactivated still resolves. One that does not resolve is
 * shown by its id rather than dropped — a bundle missing a line would understate
 * what selling it consumes.
 */
function BundleComponents({
  product,
  candidates,
  loading,
  error,
  warehouseId,
}: {
  product: Product;
  candidates: Product[];
  loading: boolean;
  error: string | null;
  warehouseId: string;
}) {
  const components = product.bundleConfig?.components ?? [];
  const limiting = limitedByAt(product, scopeOf(warehouseId));

  return (
    <Card
      title="Komponen bundle"
      description={
        product.bundleConfig?.pricingMode === "auto"
          ? "Harga dihitung dari komponen saat dijual."
          : `Harga tetap ${formatMoney(product.bundleConfig?.fixedPrice)}.`
      }
    >
      {error && <Alert variant="error">{error}</Alert>}
      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted">
          <Spinner /> Memuat komponen…
        </div>
      )}

      {components.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Bundle ini belum punya komponen.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                <th className="py-2 pr-4 text-left font-medium">Komponen</th>
                <th className="py-2 pr-4 text-right font-medium">Jumlah</th>
                <th className="py-2 text-right font-medium">HPP komponen</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => {
                const id = String(component.componentProductId);
                const item = candidates.find((row) => row._id === id);

                return (
                  <tr
                    key={id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-4">
                      {item ? (
                        <Link
                          href={`/dashboard/inventory/products/${item._id}`}
                          className="font-medium hover:text-primary-hover hover:underline"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted">
                          {id}
                        </span>
                      )}
                      {limiting === id && (
                        <Badge variant="outline" className="ml-2">
                          pembatas
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {formatQty(component.qty)}{" "}
                      <span className="text-xs text-muted">
                        {item?.unit ?? ""}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums">
                      {item?.hppAvg
                        ? formatMoney(
                            multiplyDecimals(item.hppAvg, component.qty),
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ helpers */

const TYPE_LABELS: Record<Product["productType"], string> = {
  standalone: "Produk biasa",
  parent: "Produk induk",
  variant: "Varian",
  bundle: "Bundle",
};

/** The per-warehouse array that answers "how much" for THIS type of product. */
function stockRowsOf(product: Product): ProductStockRow[] {
  if (product.productType === "bundle") return product.bundleAvailability ?? [];
  if (product.productType === "parent") return product.variantStock ?? [];
  return product.stockByWarehouse;
}

function stockLabel(product: Product): string {
  if (product.productType === "bundle") return "Bisa dibuat";
  if (product.productType === "parent") return "Stok varian";
  return "Stok";
}

function stockHint(product: Product, scope: string): string {
  if (product.productType === "bundle") {
    // Summed per warehouse and said out loud, because components cannot be
    // pooled across locations: the total is an upper bound, not a plan.
    return `Dijumlah per gudang · ${scope}`;
  }
  if (product.productType === "parent") return `Total semua varian · ${scope}`;
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

/**
 * At or below the restock threshold.
 *
 * Only for the types that hold stock: a parent's total and a bundle's
 * buildable count are not what `minStock` was set against, and colouring them
 * red would raise an alert nobody can act on from this screen.
 */
function isLow(product: Product, qty: string): boolean {
  if (
    product.productType !== "standalone" &&
    product.productType !== "variant"
  ) {
    return false;
  }
  if (product.minStock <= 0) return false;
  return (toMinor(qty) ?? 0n) <= BigInt(product.minStock) * 10_000n;
}

function warehouseName(
  warehouses: Array<{ _id: string; name: string }>,
  warehouseId: string,
): string | null {
  return warehouses.find((row) => row._id === warehouseId)?.name ?? null;
}

function categoryName(categories: Category[], categoryId: string): string {
  return categories.find((row) => row._id === String(categoryId))?.name ?? "—";
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
