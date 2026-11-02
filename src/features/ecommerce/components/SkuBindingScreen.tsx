"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Link2, Upload } from "lucide-react";

import {
  Alert,
  Card,
  ConfirmDialog,
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
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type {
  BindResult,
  ListingStatus,
  MarketplaceListing,
} from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
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

const STATUS_ORDER: ListingStatus[] = [
  "suggested",
  "unbound",
  "bound",
  "no_sku",
  "removed",
];

const SUGGESTION_REASON = { sku: "SKU mirip", name: "Nama mirip" } as const;

/**
 * Penjualan › E-commerce › Pengikatan SKU.
 *
 * One store's Shopee variations, as its latest template listed them, and the
 * Buloo product each one draws stock from. A store with no template yet opens
 * on the upload box instead of an empty table: nothing can be bound or exported
 * until Shopee's list of variations is here.
 *
 * Unbound rows come first — they are the work left — those with a saran
 * leading. A saran binds nothing until it is accepted, here or through Pilih
 * lain. No price column logic yet (V2); the Harga shown is Shopee's, read only.
 */
export function SkuBindingScreen({
  initialStoreId,
}: {
  initialStoreId?: string | null;
}) {
  const {
    stores,
    loading: storesLoading,
    error: storesError,
    refetch: refetchStores,
  } = useMarketplaceStores();
  const { storeId, store, select } = useSelectedStore(stores, initialStoreId);
  const listings = useListings(store?.template ? storeId : null);
  const { can } = usePermissions();
  const [editing, setEditing] = useState<MarketplaceListing | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [confirmAcceptAll, setConfirmAcceptAll] = useState(false);
  const refreshInput = useRef<HTMLInputElement>(null);

  const refetchListings = listings.refetch;
  const afterUpload = useCallback(() => {
    refetchStores();
    refetchListings();
  }, [refetchStores, refetchListings]);
  const { upload, uploading } = useTemplateUpload(afterUpload);

  const onChanged = (result: BindResult) => {
    setEditing(null);
    if (result.affectedListings > 1 || listings.query.status)
      listings.refetch();
    else listings.replaceListing(result.listing);
    refetchStores();
  };

  const accept = async (
    run: () => Promise<{ released?: unknown[] }>,
    done: string,
  ) => {
    setAccepting(true);
    try {
      const { released = [] } = await run();
      swalToast(
        released.length > 0
          ? `${done} ${formatCount(released.length)} pesanan tertahan masuk sebagai faktur.`
          : done,
        "success",
        released.length > 0 ? 6000 : 3000,
      );
      setConfirmAcceptAll(false);
      listings.refetch();
      refetchStores();
    } catch (error) {
      swalToast(
        ecommerceFailure(error, "Saran belum bisa diterima.").toast,
        "error",
        6000,
      );
    } finally {
      setAccepting(false);
    }
  };

  const counts = listings.counts;
  const total = counts
    ? counts.bound + counts.suggested + counts.unbound + counts.no_sku
    : 0;

  const columns: DataTableColumn<MarketplaceListing>[] = [
    {
      id: "variant",
      header: "Varian Shopee",
      cellClassName: "max-w-sm",
      cell: (row) => (
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium text-foreground">
            {row.productName}
          </div>
          <div className="text-xs text-muted">
            {row.variationName ? `${row.variationName} · ` : ""}
            <span className="tabular-nums">
              <SkuText
                value={row.shopeeSku}
                fallback="Tanpa SKU"
                query={listings.query.search}
              />
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
            <div className="line-clamp-1 text-foreground">
              {row.product.name}
            </div>
            <div className="text-xs tabular-nums text-muted">
              <SkuText value={row.product.sku} />
              {row.product.isActive ? "" : " · nonaktif"}
            </div>
          </div>
        ) : row.suggestion ? (
          <div className="min-w-0">
            <div className="line-clamp-1 text-foreground">
              {row.suggestion.name}
            </div>
            <div className="text-xs tabular-nums text-muted">
              <SkuText value={row.suggestion.sku} /> ·{" "}
              {SUGGESTION_REASON[row.suggestion.reason]}
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
      cell: (row) => (
        <span className="tabular-nums">
          {formatTemplatePrice(row.templatePrice)}
        </span>
      ),
    },
    {
      id: "stock",
      header: "Stok Buloo",
      align: "right",
      cell: (row) =>
        row.suggestion ? (
          <span className="tabular-nums text-muted">
            {row.suggestion.stock}
          </span>
        ) : row.stock === null ? (
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
        row.suggestion && can("ecommerce", "bindSku") ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={accepting}
              onClick={() => {
                const { _id } = row.suggestion!;
                void accept(
                  () => marketplaceService.bindListing(storeId!, row._id, _id),
                  "Saran diterima.",
                );
              }}
            >
              Terima
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditing(row)}
            >
              Pilih lain
            </Button>
          </div>
        ) : row.shopeeSku && can("ecommerce", "bindSku") ? (
          <Button
            type="button"
            size="sm"
            variant={row.product ? "secondary" : "default"}
            onClick={() => setEditing(row)}
          >
            {row.product ? (
              "Ubah"
            ) : (
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
      <EcommerceHeader
        stores={stores}
        storeId={storeId}
        onChanged={refetchStores}
      />

      {storesError ? <Alert variant="error">{storesError}</Alert> : null}

      {!storesLoading && stores.length === 0 && !storesError ? (
        <NoStoresCard
          onCreated={(created) => {
            select(created._id);
            refetchStores();
          }}
        />
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
                  <>
                    {counts?.suggested ? (
                      <Can feature="ecommerce" action="bindSku">
                        <Button
                          type="button"
                          disabled={accepting}
                          onClick={() => setConfirmAcceptAll(true)}
                        >
                          <Check className="size-4" aria-hidden />
                          Terima semua saran ({formatCount(counts.suggested)})
                        </Button>
                      </Can>
                    ) : null}
                    <Can feature="ecommerce" action="manageStores">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={uploading}
                        onClick={() => refreshInput.current?.click()}
                      >
                        <Upload className="size-4" aria-hidden />
                        {uploading
                          ? "Membaca template…"
                          : "Perbarui dari template Shopee"}
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
                  </>
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
                  Template terakhir{" "}
                  <span className="font-medium text-foreground">
                    {store.template.fileName}
                  </span>{" "}
                  · {formatCount(store.template.variantCount)} varian · diupload{" "}
                  {formatDateTime(store.template.uploadedAt)}
                  {store.shopId ? ` · Shop ID ${store.shopId}` : ""}
                </p>

                {listings.error ? (
                  <Alert variant="error">{listings.error}</Alert>
                ) : null}

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
                  SKU Shopee yang sama persis dengan SKU Buloo langsung terikat
                  saat template diupload. Yang mirip jadi Saran dan baru terikat
                  setelah diterima. Satu SKU yang dipakai di beberapa varian
                  Shopee terikat sekaligus. Varian yang belum terikat tidak
                  disentuh saat ekspor stok.
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
                Toko ini belum punya template Shopee. Minta admin mengupload
                template pertamanya.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      {confirmAcceptAll && storeId ? (
        <ConfirmDialog
          title="Terima semua saran?"
          confirmLabel="Terima semua"
          busy={accepting}
          onConfirm={() =>
            void accept(
              () => marketplaceService.acceptSuggestions(storeId),
              "Semua saran diterima.",
            )
          }
          onCancel={() => setConfirmAcceptAll(false)}
        >
          {formatCount(counts?.suggested ?? 0)} varian diikat ke produk yang
          disarankan, dan stoknya ikut terkirim di ekspor berikutnya. Cek dulu
          lewat filter Status: Saran. Kalau ada yang salah, ganti dengan Pilih
          lain sebelum menerima semua.
        </ConfirmDialog>
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
