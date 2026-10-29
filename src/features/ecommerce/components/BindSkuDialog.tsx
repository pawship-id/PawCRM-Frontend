"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog, SkuText } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { marketplaceService } from "@/services/marketplace.service";
import { productService } from "@/services/product.service";
import type { BindResult, MarketplaceListing } from "@/types/marketplace";
import { formatQty } from "@/utils/decimal";

import { ecommerceFailure } from "../errors";
import { formatTemplatePrice } from "../labels";
import { ListingStatusBadge } from "./ListingStatusBadge";

/** One Buloo product the dialog can bind to. */
interface Candidate {
  _id: string;
  name: string;
  sku: string | null;
}

/**
 * Ikat SKU — which Buloo product a Shopee variation draws its stock from.
 *
 * A dialog, not the mockup's right-hand drawer: the app has no drawer, and the
 * mockup's own note says not to add one. The binding is per Shopee SKU, so the
 * answer can move several listings at once; the caller reloads when it did.
 *
 * Laid out like the mockup: the Shopee variation on top, then the Buloo SKUs as
 * a pick list with their stock at the store's warehouse. With the box empty the
 * list searches by the Shopee SKU — the closest thing to the mockup's "Saran"
 * until suggestions land (V2, as does the "Harga di Shopee" override).
 *
 * Only products that hold stock are offered (standalone and variants) — the
 * server refuses a parent or a bundle anyway.
 */
export function BindSkuDialog({
  storeId,
  warehouseId,
  warehouseName,
  listing,
  onClose,
  onChanged,
}: {
  storeId: string;
  /** The store's source warehouse — whose stock each candidate shows. */
  warehouseId?: string;
  warehouseName?: string | null;
  listing: MarketplaceListing;
  onClose: () => void;
  onChanged: (result: BindResult, action: "bound" | "unbound") => void;
}) {
  const current: Candidate | null = listing.product
    ? { _id: listing.product._id, name: listing.product.name, sku: listing.product.sku }
    : null;
  const [productId, setProductId] = useState(current?._id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // An empty box looks up the Shopee SKU, so the list opens with the likely match.
  const typed = query.trim();
  const term = typed || listing.shopeeSku || "";

  useEffect(() => {
    let active = true;
    // Loading state before the request; the `active` guard makes the late
    // setStates safe — the sanctioned fetch-effect shape (see useWarehouses).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(() => {
      productService
        .list({ search: term || undefined, holdsStock: true, limit: 20 })
        .then(async (page) => {
          if (!active) return;
          const found = page.items.map((product) => ({
            _id: product._id,
            name: product.name,
            sku: product.sku ?? null,
          }));
          setResults(found);
          const ids = [...new Set([...found.map((item) => item._id), ...(current ? [current._id] : [])])];
          if (!warehouseId || ids.length === 0) return;
          const rows = await productService.stock(ids).catch(() => ({ items: [] }));
          if (!active) return;
          setStock(
            Object.fromEntries(
              rows.items.map((row) => [
                row.productId,
                row.stockByWarehouse.find((entry) => entry.warehouseId === warehouseId)?.qty ?? "0",
              ]),
            ),
          );
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `current` is fixed for the dialog's life; only the term re-runs the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, warehouseId]);

  // The bound product heads the list until the user types a search of their own.
  const shown =
    current && !typed && !results.some((item) => item._id === current._id)
      ? [current, ...results]
      : results;

  const bind = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      const result = await marketplaceService.bindListing(storeId, listing._id, productId);
      const released = result.released ?? [];
      swalToast(
        [
          result.affectedListings > 1
            ? `Terikat. ${result.affectedListings} varian Shopee dengan SKU ini ikut terikat.`
            : "Terikat.",
          released.length > 0
            ? `${released.length} pesanan tertahan masuk sebagai faktur (${released
                .slice(0, 3)
                .map((order) => order.invoiceNumber)
                .join(", ")}).`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        "success",
        released.length > 0 ? 6000 : 3000,
      );
      onChanged(result, "bound");
    } catch (error) {
      swalToast(ecommerceFailure(error, "SKU belum bisa diikat.").toast, "error", 6000);
    } finally {
      setSaving(false);
    }
  };

  const unbind = async () => {
    setSaving(true);
    try {
      const result = await marketplaceService.unbindListing(storeId, listing._id);
      swalToast("Ikatan dilepas. Stok varian ini tidak ikut diekspor lagi.");
      onChanged(result, "unbound");
    } catch (error) {
      swalToast(ecommerceFailure(error, "Ikatan belum bisa dilepas.").toast, "error", 6000);
    } finally {
      setSaving(false);
      setConfirmUnbind(false);
    }
  };

  const unchanged = productId === (listing.product?._id ?? "");

  return (
    <>
      <Dialog open={!confirmUnbind} onOpenChange={(next) => !next && !saving && onClose()}>
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          // Open on the search box: the dialog's default first stop is a cut
          // Shopee SKU, whose tooltip opens on focus and would greet every visit.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{listing.product ? "Ubah ikatan SKU" : "Ikat SKU"}</DialogTitle>
            <DialogDescription>
              Hubungkan varian Shopee ini ke produk Buloo supaya stoknya ikut diekspor dan pesanannya bisa jadi faktur.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-hover p-4 text-sm">
            <dt className="text-muted">Produk</dt>
            <dd className="font-medium text-foreground">{listing.productName}</dd>
            <dt className="text-muted">Variasi</dt>
            <dd className="font-medium text-foreground">{listing.variationName || "—"}</dd>
            <dt className="text-muted">SKU Shopee</dt>
            <dd className="font-medium tabular-nums text-foreground">
              <SkuText value={listing.shopeeSku} fallback="—" />
            </dd>
            <dt className="text-muted">Harga Shopee</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatTemplatePrice(listing.templatePrice)}</dd>
          </dl>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted">SKU Buloo</h3>
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari SKU atau nama produk Buloo"
              aria-label="Cari SKU atau nama produk Buloo"
              autoComplete="off"
            />

            {searching && shown.length === 0 ? (
              <p className="text-sm text-muted">Mencari…</p>
            ) : shown.length === 0 ? (
              <div className="space-y-2 text-sm text-muted">
                <p>
                  {typed
                    ? "Tidak ditemukan. Produk baru dibuat di Inventori."
                    : "Belum ada SKU Buloo yang mirip. Cari dengan nama atau SKU di atas."}
                </p>
                <Button asChild type="button" variant="secondary" size="sm">
                  <Link href="/dashboard/inventory/products">Buka Produk &amp; Varian</Link>
                </Button>
              </div>
            ) : (
              // About four cards tall: a long result list scrolls on its own, so the
              // Shopee details above and the footer below stay in view.
              <div
                role="radiogroup"
                aria-label="SKU Buloo"
                className="max-h-[21.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1"
              >
                {shown.map((item) => {
                  const checked = productId === item._id;
                  return (
                    <label
                      key={item._id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        checked ? "border-primary bg-surface-selected" : "border-border hover:border-primary/60",
                      )}
                    >
                      <input
                        type="radio"
                        name="bind-sku-product"
                        value={item._id}
                        checked={checked}
                        onChange={() => setProductId(item._id)}
                        className="mt-1 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs tabular-nums text-primary">
                          <SkuText value={item.sku} fallback="Tanpa SKU" />
                        </span>
                        <span className="block text-sm font-semibold text-foreground">{item.name}</span>
                        {warehouseId ? (
                          <span className="block text-xs text-muted">
                            Stok {stock[item._id] !== undefined ? formatQty(stock[item._id]) : "…"}
                            {warehouseName ? ` · ${warehouseName}` : ""}
                          </span>
                        ) : null}
                      </span>
                      {current?._id === item._id ? <ListingStatusBadge status="bound" /> : null}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <DialogFooter className="sm:justify-between">
            {listing.product ? (
              <Can feature="ecommerce" action="bindSku">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => setConfirmUnbind(true)}
                  disabled={saving}
                >
                  Lepas ikatan
                </Button>
              </Can>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Batal
              </Button>
              <Button type="button" onClick={() => void bind()} disabled={saving || !productId || unchanged}>
                {saving ? "Menyimpan…" : "Ikat SKU"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmUnbind ? (
        <ConfirmDialog
          title="Lepas ikatan SKU?"
          confirmLabel="Lepas ikatan"
          destructive
          busy={saving}
          onConfirm={() => void unbind()}
          onCancel={() => setConfirmUnbind(false)}
        >
          Varian Shopee dengan SKU <strong>{listing.shopeeSku}</strong> tidak lagi terhubung ke{" "}
          {listing.product?.name}. Saat ekspor stok berikutnya, stoknya di file dibiarkan seperti di
          Shopee.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
