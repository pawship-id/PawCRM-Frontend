"use client";

import { SkuText } from "@/components/SkuText";
import { useState } from "react";
import Link from "next/link";
import { EllipsisVertical, Eye, Pencil, RotateCcw, Trash2 } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type { Category } from "@/types/api";
import type { Product, ProductSort } from "@/types/inventory";

import { useProductVariants } from "../hooks/useProductVariants";
import {
  availabilitySpread,
  limitedByAt,
  qtyIn,
  stockOf,
} from "../utils/catalogue";
import type { WarehouseScope } from "../utils/catalogue";
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
 * everything else what is on the shelf. The one thing this screen works out for
 * itself is a scope covering more than one warehouse, which adds those
 * per-warehouse figures up — exactly, on BigInt minor units, never on floats.
 * See utils/catalogue.
 *
 * AND ONLY THE SHELVES THIS ACCOUNT REACHES ARE IN IT. Every per-warehouse field
 * the backend sends — `stockByWarehouse`, `variantStock`, `bundleAvailability` —
 * is narrowed to the caller before it arrives, so an empty scope adds up their
 * locations rather than the tenant's. That is the server's answer and not this
 * table's to re-decide; `utils/accessScope.ts` stays a courtesy for the PICKER,
 * which is the different job of not offering a choice that can only 403.
 *
 * THE ROW ACTIONS LIVE BEHIND A KEBAB MENU, as on the supplier list and for the
 * same reason: this table already carries three numeric columns the screen
 * exists for, and a third inline button pushed them off the right edge on a
 * laptop. The trigger is one click; what it costs is a second click for the
 * action, and what it buys is that the prices and the stock stay readable.
 *
 * DETAIL IS THE FIRST ITEM and the only ungated one — it needs `products:read`,
 * which is already what put the row on screen, so a menu never opens onto
 * nothing. Variant rows have no menu: the variant's own name links to its detail
 * page, and everything else about a variant is edited through its parent's form.
 *
 * THE HEADERS SORT, ON THE SERVER (BO, 19 October 2026). A click asks
 * `GET /api/products` for another named ordering; the page is never re-sorted
 * here. Variant rows ride under their parent wherever it lands.
 *
 * STOK SORTS BY WHAT IT SHOWS: the server ranks a parent by its variants' total
 * and a bundle by how many can be built, over the warehouses picked in the
 * toolbar — the same figures this column adds up. Tipe and Kategori do not sort
 * (BO, 19 October 2026).
 */
const SORT_OPTIONS: SortOptions<ProductSort> = {
  name: { asc: "nameAsc", desc: "nameDesc" },
  hpp: { asc: "hppAsc", desc: "hppDesc", first: "desc" },
  price: { asc: "priceAsc", desc: "priceDesc", first: "desc" },
  stock: { asc: "stockAsc", desc: "stockDesc", first: "desc" },
};

export function ProductsTable({
  products,
  categories,
  warehouseIds,
  loading,
  sort,
  onSortChange,
  onChanged,
}: {
  products: Product[];
  categories: Category[];
  /** The warehouses every quantity here is reported for; empty means all. */
  warehouseIds: WarehouseScope;
  loading: boolean;
  /** The ordering the page is in — an API name. */
  sort: ProductSort;
  onSortChange: (sort: ProductSort) => void;
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

  /** Below its own threshold — standalone only; a parent and a bundle have none. */
  function isLow(product: Product) {
    return (
      product.productType === "standalone" &&
      product.minStock > 0 &&
      (toMinor(stockOf(product, warehouseIds)) ?? 0n) <=
        BigInt(product.minStock) * 10_000n
    );
  }

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

  const columns: DataTableColumn<Product>[] = [
    {
      id: "name",
      header: "Produk",
      cell: (product) => {
        const isOpen = expanded === product._id;
        const variantCount = product.variantCount ?? 0;
        return (
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
            {/* The thumbnail, resolved: a variant with no image of its own
                shows its parent's, so a catalogue row is never a blank square.
                40px because the row is 2.5 units tall and anything larger
                reflows it. */}
            {product.resolved?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                // The 320px thumb is the right size for a 40px row. The 800px
                // one is only a fallback for media that predates the
                // thumbnail, and it beats dropping forty full-size images into
                // one table.
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
            <div className={cn(variantCount === 0 && "pl-1")}>
              {/* The name is the way IN to a product — the Edit button opens
                  the form, this opens the read-only view most people actually
                  want. */}
              <Link
                href={`/dashboard/inventory/products/${product._id}`}
                className="font-medium hover:text-primary-hover hover:underline"
              >
                {product.name}
              </Link>
              {product.resolved?.brand && (
                <p className="text-xs text-muted">{product.resolved.brand}</p>
              )}
              <p className="tabular-nums text-xs text-muted">
                {/* A parent carries no SKU — its variants do. "—" rather than
                    a blank line, which reads as a rendering bug. */}
                <SkuText value={product.sku} fallback="—" />
                {product.barcode && ` · ⦀ ${product.barcode}`}
                {product.isPreorder && (
                  <span className="ml-2 font-sans text-secondary-foreground">
                    pre-order
                  </span>
                )}
                {/* Sits with pre-order rather than in the badge column beside
                    the type badge: both are one-word notes ABOUT this SKU, and
                    the badge column is what the row is. */}
                {product.isConsignment && (
                  <span className="ml-2 font-sans text-secondary-foreground">
                    titipan
                  </span>
                )}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Tipe",
      cell: (product) => (
        <div className="flex flex-wrap gap-1">
          <ProductTypeBadge
            type={product.productType}
            variantCount={
              product.productType === "parent"
                ? (product.variantCount ?? 0)
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
          {product.deletedAt && <Badge variant="outline">terhapus</Badge>}
        </div>
      ),
    },
    {
      id: "category",
      header: "Kategori",
      cellClassName: "text-xs text-muted",
      cell: (product) =>
        categories.find((c) => c._id === product.categoryId)?.name ?? "—",
    },
    {
      id: "hpp",
      header: "HPP",
      align: "right",
      cellClassName: "text-xs",
      cell: (product) =>
        product.productType === "parent" ? (
          <span className="text-muted">—</span>
        ) : (
          formatMoney(product.hppAvg)
        ),
    },
    {
      id: "price",
      header: "Harga jual",
      align: "right",
      cellClassName: "text-xs",
      cell: (product) => formatMoney(product.sellPrice),
    },
    {
      id: "stock",
      header: "Stok",
      align: "right",
      cellClassName: (product) =>
        cn("text-sm", isLow(product) && "font-semibold text-danger"),
      cell: (product) => (
        <>
          {formatQty(stockOf(product, warehouseIds))}
          {product.productType === "bundle" && (
            <>
              <span className="ml-1 text-[11px] text-muted">bisa dibuat</span>
              <BundleNote
                product={product}
                warehouseIds={warehouseIds}
                names={namesById}
              />
            </>
          )}
        </>
      ),
    },
    {
      id: "actions",
      header: "Aksi",
      align: "right",
      cell: (product) => (
        <div className="flex items-center justify-end">
          <RowMenu
            product={product}
            onPick={(action) => setPending({ product, action })}
          />
        </div>
      ),
    },
  ];

  /** The rows an open family adds under itself: loading, a failure, or its variants. */
  function variantRows(product: Product) {
    if (expanded !== product._id) return null;
    const error = variants.errors[product._id];

    return (
      <>
        {variants.loading[product._id] && (
          <TableRow className="bg-accent/30">
            <TableCell
              colSpan={columns.length}
              className="py-3 pl-16 text-xs text-muted"
            >
              Memuat varian…
            </TableCell>
          </TableRow>
        )}

        {error && (
          <TableRow className="bg-accent/30">
            <TableCell
              colSpan={columns.length}
              className="py-3 pl-16 text-xs whitespace-normal text-danger"
            >
              {error}
            </TableCell>
          </TableRow>
        )}

        {(variants.byParent[product._id] ?? []).map((variant) => {
          const variantStock = qtyIn(variant.stockByWarehouse, warehouseIds);
          const variantLow =
            variant.minStock > 0 &&
            (toMinor(variantStock) ?? 0n) <= BigInt(variant.minStock) * 10_000n;

          return (
            <TableRow key={variant._id} className="bg-accent/30">
              <TableCell className="pl-16">
                <Link
                  href={`/dashboard/inventory/products/${variant._id}`}
                  className="text-sm hover:text-primary-hover hover:underline"
                >
                  {Object.values(variant.variantAttributes ?? {}).join(" / ")}
                </Link>
                <p className="tabular-nums text-xs text-muted">
                  <SkuText value={variant.sku} />
                  {variant.barcode && ` · ⦀ ${variant.barcode}`}
                </p>
              </TableCell>
              <TableCell>
                <ProductTypeBadge type="variant" />
              </TableCell>
              <TableCell className="text-xs text-muted">↳ ikut induk</TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {formatMoney(variant.hppAvg)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {formatMoney(variant.sellPrice)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums text-sm",
                  variantLow && "font-semibold text-danger",
                )}
              >
                {formatQty(variantStock)}
              </TableCell>
              <TableCell />
            </TableRow>
          );
        })}
      </>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={products}
        rowKey={(product) => product._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat katalog…"
        rowClassName={(product) => Boolean(product.deletedAt) && "opacity-60"}
        renderAfterRow={variantRows}
        empty={
          <div className="py-16 text-center">
            <p className="font-medium text-foreground">
              Tidak ada produk cocok
            </p>
            <p className="mt-1 text-sm text-muted">
              Ubah kata kunci atau filternya.
            </p>
          </div>
        }
      />

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
 * A row's kebab menu. Detail is ungated; restore, edit and delete each sit
 * behind their own grant, and the two that write hand the choice back up to the
 * table's ConfirmDialog.
 */
function RowMenu({
  product,
  onPick,
}: {
  product: Product;
  onPick: (action: "delete" | "restore") => void;
}) {
  const deleted = Boolean(product.deletedAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // The icon carries no name of its own, so the label says which row
          // this menu belongs to — a screen-reader user hearing twenty
          // identical "Aksi" buttons has learnt nothing.
          aria-label={`Aksi untuk ${product.name}`}
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {/* Ungated: it needs `products:read`, which is already what put this
            row on screen — so the menu can never open onto nothing. */}
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/inventory/products/${product._id}`}>
            <Eye />
            Detail
          </Link>
        </DropdownMenuItem>

        {deleted ? (
          <Can feature="products" action="restore">
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onPick("restore")}>
              <RotateCcw />
              Pulihkan
            </DropdownMenuItem>
          </Can>
        ) : (
          <>
            <Can feature="products" action="update">
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/inventory/products/${product._id}/edit`}
                >
                  <Pencil />
                  Edit
                </Link>
              </DropdownMenuItem>
            </Can>
            <Can feature="products" action="delete">
              {/* Separated and tinted: everything above it only navigates, and
                  this one writes. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onPick("delete")}
              >
                <Trash2 />
                Hapus
              </DropdownMenuItem>
            </Can>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The line under a bundle's figure, which says one of two different things.
 *
 * WITH ONE WAREHOUSE IN SCOPE, which component caps it. The API answers with the
 * component's id; the name comes from whatever is already on screen — the page's
 * own rows and any expanded variants. A bundle whose limiting component is not
 * on this page renders NOTHING rather than "dibatasi <id>", because an id tells
 * the user less than silence does. Fetching it would be one request per bundle
 * row to add one word.
 *
 * ACROSS SEVERAL, that the number is a sum — because components cannot be pooled
 * between locations, so four buildable here and three there is an upper bound
 * and not seven bundles anybody can assemble. There is no single cap to name in
 * that case: each warehouse ran out of something different.
 */
function BundleNote({
  product,
  warehouseIds,
  names,
}: {
  product: Product;
  warehouseIds: WarehouseScope;
  names: Map<string, string>;
}) {
  const limitedBy = limitedByAt(product, warehouseIds);
  const name = limitedBy ? names.get(String(limitedBy)) : undefined;

  if (name) {
    return (
      <span className="block text-[11px] font-normal text-muted">
        dibatasi {name}
      </span>
    );
  }

  if (availabilitySpread(product, warehouseIds) > 1) {
    return (
      <span className="block text-[11px] font-normal text-muted">
        dijumlah per gudang
      </span>
    );
  }

  return null;
}
