"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { Alert, Card, DataTable, Pagination, StatTile, type DataTableColumn } from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type {
  MarketplaceHistoryEntry,
  MarketplaceListing,
  MarketplaceOrderRecord,
  MarketplaceStore,
} from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import { useMarketplaceHistory } from "../hooks/useMarketplaceHistory";
import { useMarketplaceOrders } from "../hooks/useMarketplaceOrders";
import { useMarketplaceStores } from "../hooks/useMarketplaceStores";
import {
  ECOMMERCE_SKU_HREF,
  INVOICE_HREF,
  MARKETPLACE_LABEL,
  PROCESS_LABEL,
  formatCount,
  formatDate,
  formatDateTime,
  formatRupiah,
  withStore,
} from "../labels";
import { BindSkuDialog } from "./BindSkuDialog";
import { ConnectStoreDialog } from "./ConnectStoreDialog";
import { EcommerceHeader } from "./EcommerceHeader";
import { HeldOrderDialog } from "./HeldOrderDialog";
import { HistoryDetailDialog } from "./HistoryDetailDialog";

const COMING_SOON = ["Tokopedia", "TikTok Shop"];

function historySummary(entry: MarketplaceHistoryEntry): string {
  const r = entry.result;
  const parts = (...items: Array<string | false>) => items.filter(Boolean).join(" · ");
  if (entry.process === "template") {
    return parts(`${formatCount(r.variants)} varian dibaca`, `${formatCount(r.autoBound)} langsung terikat`);
  }
  if (entry.process === "orders") {
    return parts(
      `${formatCount(r.created)} faktur dibuat`,
      Boolean(r.held) && `${formatCount(r.held)} pesanan tertahan`,
      Boolean(r.flagged) && `${formatCount(r.flagged)} ditandai Batal`,
    );
  }
  if (entry.process === "settlement") {
    return parts(
      `${formatCount(r.settled)} faktur lunas`,
      Boolean(r.variance) && `${formatCount(r.variance)} selisih`,
      r.number ?? false,
    );
  }
  return `${formatCount((r.changed ?? 0) + (r.same ?? 0))} varian diisi`;
}

/** The dot before each process name, as the mockup colours them. */
const PROCESS_DOT: Record<MarketplaceHistoryEntry["process"], string> = {
  template: "bg-muted",
  stock_export: "bg-secondary",
  orders: "bg-primary",
  settlement: "bg-success",
};

/** Selesai, unless something in the run still needs a person. */
function historyStatus(entry: MarketplaceHistoryEntry): { label: string; tone: string } {
  const r = entry.result;
  if (r.failed) return { label: `${formatCount(r.failed)} gagal`, tone: "bg-tint-danger text-danger" };
  if (entry.process === "orders" && r.held) {
    return { label: `${formatCount(r.held)} tertahan`, tone: "bg-tint-warning text-warning" };
  }
  return { label: "Selesai", tone: "bg-tint-success text-success" };
}

/**
 * Penjualan › E-commerce › Ringkasan.
 *
 * The figures (what Shopee still owes, held orders, bound variations, the last
 * export), the connected stores as cards, the held-order queue, Perlu tindakan
 * (orders Shopee cancelled after they became invoices), and Riwayat.
 */
export function EcommerceSummaryScreen() {
  const { stores, loading, error, refetch } = useMarketplaceStores();
  const history = useMarketplaceHistory();
  const orders = useMarketplaceOrders();
  const { can } = usePermissions();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [opened, setOpened] = useState<MarketplaceHistoryEntry | null>(null);
  const [viewing, setViewing] = useState<MarketplaceOrderRecord | null>(null);
  const [binding, setBinding] = useState<{ storeId: string; listing: MarketplaceListing } | null>(null);

  const storeName = (id: string) => stores.find((store) => store._id === id)?.name ?? "Toko";

  const bound = stores.reduce((sum, store) => sum + (store.listingCounts?.bound ?? 0), 0);
  const unbound = stores.reduce((sum, store) => sum + (store.listingCounts?.unbound ?? 0), 0);
  const lastExport = stores
    .filter((store) => store.lastStockExportAt)
    .sort((a, b) => String(b.lastStockExportAt).localeCompare(String(a.lastStockExportAt)))[0];

  const unpaidAmount = stores.reduce((sum, store) => sum + Number(store.unpaid?.amount ?? 0), 0);
  const unpaidCount = stores.reduce((sum, store) => sum + (store.unpaid?.count ?? 0), 0);

  const afterChange = () => {
    refetch();
    history.refetch();
    orders.refetch();
  };

  /** The first line still waiting — the one the row names and Ikat SKU opens. */
  const firstUnbound = (row: MarketplaceOrderRecord) => {
    const waiting = new Set(row.unboundSkus ?? []);
    return (row.lines ?? []).find((line) => !line.sku || waiting.has(line.sku)) ?? null;
  };

  const openBind = async (row: MarketplaceOrderRecord, sku: string) => {
    try {
      const page = await marketplaceService.listListings(row.storeId, { search: sku, limit: 20 });
      const listing = page.items.find((item) => item.shopeeSku === sku);
      if (!listing) {
        swalToast("SKU ini tidak ada di template tersimpan. Upload template terbaru di Pengikatan SKU.", "error", 6000);
        return;
      }
      setViewing(null);
      setBinding({ storeId: row.storeId, listing });
    } catch (error) {
      swalToast(ecommerceFailure(error, "Varian Shopee belum bisa dibuka.").toast, "error", 6000);
    }
  };

  const heldColumns: DataTableColumn<MarketplaceOrderRecord>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="font-semibold tabular-nums text-foreground">{row.orderNo}</div>
          <div className="text-sm text-muted">Shopee · {storeName(row.storeId)}</div>
        </div>
      ),
    },
    {
      id: "date",
      header: "Tanggal",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.paidAt ?? row.orderedAt)}</span>,
    },
    {
      id: "skus",
      header: "Varian belum terikat",
      cell: (row) => {
        const line = firstUnbound(row);
        const more = (row.unboundSkus?.length ?? 0) - 1;
        return line ? (
          <div className="min-w-0 max-w-[26rem]">
            <div className="line-clamp-1 font-semibold text-foreground">{line.productName}</div>
            <div className="text-sm text-muted">
              {line.variationName ? `${line.variationName} · ` : ""}
              <span className="tabular-nums text-primary">{line.sku ?? "Tanpa SKU"}</span> · {line.qty} pcs
              {more > 0 ? ` · +${more} varian lain` : ""}
            </div>
          </div>
        ) : (
          <span className="text-sm">{(row.unboundSkus ?? []).join(", ")}</span>
        );
      },
    },
    {
      id: "total",
      header: "Nilai",
      align: "right",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatRupiah(row.total)}</span>,
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) => {
        const sku = firstUnbound(row)?.sku;
        return (
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => setViewing(row)}>
              Lihat pesanan
            </Button>
            {sku && can("ecommerce", "bindSku") ? (
              <Button type="button" size="sm" className="whitespace-nowrap" onClick={() => void openBind(row, sku)}>
                Ikat SKU
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const actionColumns: DataTableColumn<MarketplaceOrderRecord>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="tabular-nums font-medium text-foreground">{row.orderNo}</div>
          <div className="text-xs text-muted">{storeName(row.storeId)}</div>
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Faktur",
      cell: (row) =>
        row.invoiceId ? (
          <Link href={INVOICE_HREF(row.invoiceId)} className="tabular-nums text-primary underline">
            {row.invoiceNumber}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "what",
      header: "Tindakan",
      cell: (row) =>
        row.invoiceStatus === "paid"
          ? "Sudah lunas — koreksi lewat jurnal manual"
          : "Batalkan faktur ini (menu ⋮ di halaman faktur)",
    },
  ];

  const columns: DataTableColumn<MarketplaceHistoryEntry>[] = [
    {
      id: "time",
      header: "Waktu",
      cell: (row) => <span className="font-medium tabular-nums text-foreground">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: "process",
      header: "Proses",
      cell: (row) => (
        <div>
          <div className="flex items-center gap-2 font-semibold whitespace-nowrap text-foreground">
            <span className={cn("size-2.5 flex-none rounded-full", PROCESS_DOT[row.process])} aria-hidden />
            {PROCESS_LABEL[row.process]}
          </div>
          <div className="text-sm text-muted">Shopee · {storeName(row.storeId)}</div>
        </div>
      ),
    },
    {
      id: "result",
      header: "File & hasil",
      cell: (row) => (
        <div className="min-w-0">
          <div className="text-foreground">{historySummary(row)}</div>
          {row.fileName ? <div className="text-sm break-all tabular-nums text-muted">{row.fileName}</div> : null}
        </div>
      ),
    },
    {
      id: "by",
      header: "Oleh",
      cell: (row) => <span className="whitespace-nowrap">{row.createdByName ?? "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const status = historyStatus(row);
        return (
          <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>
            {status.label}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <EcommerceHeader stores={stores} onChanged={afterChange} />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Belum cair"
          value={formatRupiah(unpaidAmount)}
          caption={`${formatCount(unpaidCount)} faktur Shopee`}
          hint="Faktur Shopee yang dananya belum dilepas. Lunas saat Laporan Penghasilan diimpor."
          loading={loading}
        />
        <StatTile
          label="Pesanan tertahan"
          value={formatCount(orders.held.length)}
          caption="SKU belum terikat"
          hint="Pesanan yang belum jadi faktur karena ada SKU Shopee yang belum diikat. Otomatis jadi faktur setelah diikat."
          loading={orders.loading}
        />
        <StatTile
          label="Varian terikat"
          value={formatCount(bound)}
          caption={`dari ${formatCount(bound + unbound)} varian ber-SKU`}
          hint="Varian Shopee yang sudah terhubung ke produk Buloo. Hanya varian terikat yang stoknya ikut diekspor."
          loading={loading}
        />
        <StatTile
          label="Ekspor stok terakhir"
          value={lastExport ? formatDateTime(lastExport.lastStockExportAt) : "—"}
          caption={lastExport ? lastExport.name : "belum pernah"}
          loading={loading}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">Toko</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <StoreCard key={store._id} store={store} />
          ))}

          <Can feature="ecommerce" action="manageStores">
            <button
              type="button"
              onClick={() => setConnecting(true)}
              className={cn(
                "flex min-h-32 items-center gap-3 rounded-xl border-2 border-dashed border-border p-6 text-left transition",
                "hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-tint-info text-info">
                <Plus className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold text-foreground">Hubungkan toko</span>
                <span className="block text-sm text-muted">Shopee</span>
              </span>
            </button>
          </Can>

          {COMING_SOON.map((name) => (
            <div
              key={name}
              className="flex min-h-32 items-start justify-between gap-3 rounded-xl border border-border p-6 opacity-70"
            >
              <div>
                <p className="font-semibold text-foreground">{name}</p>
                <p className="text-sm text-muted">Belum dihubungkan</p>
              </div>
              <span className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
                Segera hadir
              </span>
            </div>
          ))}
        </div>
      </section>

      {orders.held.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-foreground">Pesanan tertahan</h2>
            <DataTable
              columns={heldColumns}
              rows={orders.held}
              rowKey={(row) => row._id}
              loading={orders.loading}
              rowClassName={() => "bg-tint-hold"}
            />
          </div>
        </Card>
      ) : null}

      {orders.needsAction.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-foreground">Perlu tindakan</h2>
            <p className="text-sm text-muted">Pesanan ini Batal di Shopee setelah jadi faktur.</p>
            <DataTable
              columns={actionColumns}
              rows={orders.needsAction}
              rowKey={(row) => row._id}
              loading={orders.loading}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-foreground">Riwayat</h2>
          {history.error ? <Alert variant="error">{history.error}</Alert> : null}
          <DataTable
            columns={columns}
            rows={history.entries}
            rowKey={(row) => row._id}
            loading={history.loading}
            onRowClick={setOpened}
            empty={
              can("ecommerce", "manageStores")
                ? "Belum ada riwayat. Hubungkan toko dan upload template pertamanya."
                : "Belum ada riwayat."
            }
          />
          {history.pagination.totalPages > 1 ? (
            <Pagination
              page={history.pagination.page}
              totalPages={history.pagination.totalPages}
              total={history.pagination.total}
              unit="riwayat"
              onPageChange={history.setPage}
            />
          ) : null}
        </div>
      </Card>

      {viewing ? (
        <HeldOrderDialog
          order={viewing}
          storeLabel={`Shopee · ${storeName(viewing.storeId)}`}
          onBind={(sku) => void openBind(viewing, sku)}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {binding ? (
        <BindSkuDialog
          storeId={binding.storeId}
          warehouseId={stores.find((store) => store._id === binding.storeId)?.warehouseId ?? undefined}
          warehouseName={stores.find((store) => store._id === binding.storeId)?.warehouseName ?? null}
          listing={binding.listing}
          onClose={() => setBinding(null)}
          onChanged={() => {
            setBinding(null);
            afterChange();
          }}
        />
      ) : null}

      {connecting ? (
        <ConnectStoreDialog
          onClose={() => setConnecting(false)}
          onCreated={(store) => {
            setConnecting(false);
            refetch();
            router.push(withStore(ECOMMERCE_SKU_HREF, store._id));
          }}
        />
      ) : null}

      {opened ? (
        <HistoryDetailDialog
          entry={opened}
          storeName={storeName(opened.storeId)}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  );
}

function StoreCard({ store }: { store: MarketplaceStore }) {
  const counts = store.listingCounts;
  const skuHref = withStore(ECOMMERCE_SKU_HREF, store._id);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              {MARKETPLACE_LABEL[store.marketplace]}{" "}
              <span className="text-muted">· {store.name}</span>
            </p>
            <p className="text-sm text-muted">
              {[store.branchName, store.warehouseName].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <span
            className={cn(
              "flex-none rounded-full px-2 py-0.5 text-xs font-medium",
              store.isActive ? "bg-tint-success text-success" : "bg-tint-neutral text-muted",
            )}
          >
            {store.isActive ? "Aktif" : "Nonaktif"}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Varian terikat</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {store.template ? formatCount(counts?.bound) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Impor pesanan</dt>
            <dd className="tabular-nums text-foreground">
              {store.lastOrderImportAt ? formatDateTime(store.lastOrderImportAt) : "Belum"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ekspor stok</dt>
            <dd className="tabular-nums text-foreground">
              {store.lastStockExportAt ? formatDateTime(store.lastStockExportAt) : "Belum"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Belum cair</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {store.unpaid?.count ? formatRupiah(store.unpaid.amount) : "—"}
            </dd>
          </div>
        </dl>

        <Link
          href={skuHref}
          className={cn(
            "flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold transition",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            store.template ? "bg-surface-hover text-foreground hover:bg-surface-selected" : "bg-tint-warning text-foreground",
          )}
        >
          {!store.template
            ? "Upload template pertama"
            : store.orderCounts?.held
              ? `${formatCount(store.orderCounts.held)} pesanan tertahan, SKU belum terikat`
              : counts?.unbound
                ? `${formatCount(counts.unbound)} varian belum terikat`
                : "Buka Pengikatan SKU"}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
