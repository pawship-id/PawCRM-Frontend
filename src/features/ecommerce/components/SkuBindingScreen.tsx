"use client";

import { useCallback, useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Pagination,
  SkuText,
  type DataTableColumn,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import type { BindResult, ListingStatus, MarketplaceListing } from "@/types/marketplace";

import { useListings } from "../hooks/useListings";
import { useMarketplaceStores } from "../hooks/useMarketplaceStores";
import { useSelectedStore } from "../hooks/useSelectedStore";
import { useTemplateUpload } from "../hooks/useTemplateUpload";
import {
  LISTING_STATUS_LABEL,
  formatCount,
  formatDateTime,
  formatTemplatePrice,
} from "../labels";
import { BindSkuDialog } from "./BindSkuDialog";
import { EcommerceHeader } from "./EcommerceHeader";
import { ListingStatusBadge } from "./ListingStatusBadge";
import { NoStoresCard } from "./NoStoresCard";
import { StorePicker } from "./StorePicker";
import { TemplateDropzone } from "./TemplateDropzone";

const STATUS_ORDER: ListingStatus[] = ["unbound", "bound", "no_sku", "removed"];

/**
 * Penjualan › E-commerce › Pengikatan SKU.
 *
 * One store's Shopee variations, as its latest template listed them, and the
 * Buloo product each one draws stock from. A store with no template yet opens
 * on the upload box instead of an empty table: nothing can be bound or exported
 * until Shopee's list of variations is here.
 *
 * Unbound rows come first — they are the work left. V1 has no suggestions and
 * no price column logic (both V2); the Harga shown is Shopee's, read only.
 */
export function SkuBindingScreen({ initialStoreId }: { initialStoreId?: string | null }) {
  const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } =
    useMarketplaceStores();
  const { storeId, store, select } = useSelectedStore(stores, initialStoreId);
  const listings = useListings(store?.template ? storeId : null);
  const { can } = usePermissions();
  const [editing, setEditing] = useState<MarketplaceListing | null>(null);
  const refreshInput = useRef<HTMLInputElement>(null);

  const refetchListings = listings.refetch;
  const afterUpload = useCallback(() => {
    refetchStores();
    refetchListings();
  }, [refetchStores, refetchListings]);
  const { upload, uploading } = useTemplateUpload(afterUpload);

  const onChanged = (result: BindResult) => {
    setEditing(null);
    if (result.affectedListings > 1 || listings.query.status) listings.refetch();
    else listings.replaceListing(result.listing);
    refetchStores();
  };

  const counts = listings.counts;
  const total = counts ? counts.bound + counts.unbound + counts.no_sku : 0;

  const columns: DataTableColumn<MarketplaceListing>[] = [
    {
      id: "variant",
      header: "Varian Shopee",
      cellClassName: "max-w-sm",
      cell: (row) => (
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium text-foreground">{row.productName}</div>
          <div className="text-xs text-muted">
            {row.variationName ? `${row.variationName} · ` : ""}
            <span className="tabular-nums">
              <SkuText value={row.shopeeSku} fallback="Tanpa SKU" query={listings.query.search} />
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "buloo",
      header: "SKU Buloo",
      cellClassName: "max-w-xs",
      cell: (row) =>
        row.product ? (
          <div className="min-w-0">
            <div className="line-clamp-1 text-foreground">{row.product.name}</div>
            <div className="text-xs tabular-nums text-muted">
              <SkuText value={row.product.sku} />
              {row.product.isActive ? "" : " · nonaktif"}
            </div>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      id: "price",
      header: "Harga Shopee",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatTemplatePrice(row.templatePrice)}</span>,
    },
    {
      id: "stock",
      header: "Stok Buloo",
      align: "right",
      cell: (row) =>
        row.stock === null ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="tabular-nums">
            <div className="text-foreground">{row.stock}</div>
            <div className="text-xs text-muted">dikirim {row.exportStock}</div>
          </div>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <ListingStatusBadge status={row.status} />,
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) =>
        row.shopeeSku && can("ecommerce", "bindSku") ? (
          <Button
            type="button"
            size="sm"
            variant={row.product ? "secondary" : "default"}
            onClick={() => setEditing(row)}
          >
            {row.product ? "Ubah" : (
              <>
                <Link2 className="size-4" aria-hidden />
                Ikat
              </>
            )}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <EcommerceHeader stores={stores} storeId={storeId} onChanged={refetchStores} />

      {storesError ? <Alert variant="error">{storesError}</Alert> : null}

      {!storesLoading && stores.length === 0 && !storesError ? (
        <NoStoresCard onCreated={(created) => {
          select(created._id);
          refetchStores();
        }} />
      ) : null}

      {store ? (
        <Card>
          <div className="flex flex-col gap-4">
            <FilterBar
              search={
                store.template ? (
                  <FilterSearch
                    value={listings.query.search}
                    onChange={(search) => listings.setQuery({ search })}
                    placeholder="Cari nama produk, variasi, atau SKU"
                    ariaLabel="Cari varian Shopee"
                  />
                ) : undefined
              }
              actions={
                store.template ? (
                  <Can feature="ecommerce" action="manageStores">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={uploading}
                      onClick={() => refreshInput.current?.click()}
                    >
                      <Upload className="size-4" aria-hidden />
                      {uploading ? "Membaca template…" : "Perbarui dari template Shopee"}
                    </Button>
                    <input
                      ref={refreshInput}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      aria-label="Pilih template Shopee terbaru (.xlsx)"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(store._id, file);
                        event.target.value = "";
                      }}
                    />
                  </Can>
                ) : undefined
              }
            >
              <StorePicker stores={stores} value={storeId} onChange={select} />
              {store.template ? (
                <FilterSelect
                  label="Status"
                  value={listings.query.status}
                  onChange={(status) => listings.setQuery({ status })}
                  options={[
                    { value: "" as const, label: "Semua status", count: total },
                    ...STATUS_ORDER.map((status) => ({
                      value: status,
                      label: LISTING_STATUS_LABEL[status],
                      count: counts?.[status] ?? 0,
                    })),
                  ]}
                />
              ) : null}
            </FilterBar>

            {store.template ? (
              <>
                <p className="text-sm text-muted">
                  Template terakhir <span className="font-medium text-foreground">{store.template.fileName}</span>{" "}
                  · {formatCount(store.template.variantCount)} varian · diupload{" "}
                  {formatDateTime(store.template.uploadedAt)}
                  {store.shopId ? ` · Shop ID ${store.shopId}` : ""}
                </p>

                {listings.error ? <Alert variant="error">{listings.error}</Alert> : null}

                <DataTable
                  columns={columns}
                  rows={listings.listings}
                  rowKey={(row) => row._id}
                  loading={listings.loading}
                  empty={
                    listings.query.search || listings.query.status
                      ? "Tidak ada varian yang cocok dengan pencarian atau status ini."
                      : "Template ini tidak berisi varian."
                  }
                />

                {listings.pagination.totalPages > 1 ? (
                  <Pagination
                    page={listings.pagination.page}
                    totalPages={listings.pagination.totalPages}
                    total={listings.pagination.total}
                    unit="varian"
                    onPageChange={(page) => listings.setQuery({ page })}
                  />
                ) : null}

                <p className="text-sm text-muted">
                  SKU Shopee yang sama persis dengan SKU Buloo langsung terikat saat template
                  diupload. Satu SKU yang dipakai di beberapa varian Shopee terikat sekaligus. Varian
                  belum terikat tidak disentuh saat ekspor stok.
                </p>
              </>
            ) : can("ecommerce", "manageStores") ? (
              <TemplateDropzone
                title={`Upload template pertama ${store.name}`}
                busy={uploading}
                onPick={(file) => void upload(store._id, file)}
              />
            ) : (
              <p className="text-sm text-muted">
                Toko ini belum punya template Shopee. Minta admin mengupload template pertamanya.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      {editing && storeId ? (
        <BindSkuDialog
          storeId={storeId}
          warehouseId={store?.warehouseId}
          warehouseName={store?.warehouseName}
          listing={editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}
