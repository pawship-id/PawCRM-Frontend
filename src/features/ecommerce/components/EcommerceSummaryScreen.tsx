"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { Alert, Card, DataTable, Pagination, StatTile, type DataTableColumn } from "@/components";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type {
  MarketplaceHistoryEntry,
  MarketplaceOrderRecord,
  MarketplaceStore,
} from "@/types/marketplace";

import { useMarketplaceHistory } from "../hooks/useMarketplaceHistory";
import { useMarketplaceOrders } from "../hooks/useMarketplaceOrders";
import { useMarketplaceStores } from "../hooks/useMarketplaceStores";
import {
  ECOMMERCE_SKU_HREF,
  INVOICE_HREF,
  MARKETPLACE_LABEL,
  PROCESS_LABEL,
  formatCount,
  formatDateTime,
  formatRupiah,
  withStore,
} from "../labels";
import { ConnectStoreDialog } from "./ConnectStoreDialog";
import { EcommerceHeader } from "./EcommerceHeader";
import { HistoryDetailDialog } from "./HistoryDetailDialog";

const COMING_SOON = ["Tokopedia", "TikTok Shop"];

function historySummary(entry: MarketplaceHistoryEntry): string {
  const r = entry.result;
  if (entry.process === "template") {
    return `${formatCount(r.variants)} varian · ${formatCount(r.autoBound)} langsung terikat`;
  }
  if (entry.process === "orders") {
    return `${formatCount(r.created)} faktur · ${formatCount(r.held)} ditahan · ${formatCount(r.skipped)} dilewati`;
  }
  if (entry.process === "settlement") {
    return `${r.number ?? "—"} · ${formatCount(r.settled)} faktur lunas`;
  }
  return `${formatCount(r.changed)} stok berubah · ${formatCount(r.same)} sama`;
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

  const heldColumns: DataTableColumn<MarketplaceOrderRecord>[] = [
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
      id: "date",
      header: "Dibayar",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.paidAt ?? row.orderedAt)}</span>,
    },
    {
      id: "skus",
      header: "SKU belum terikat",
      cell: (row) => <span className="text-sm">{(row.unboundSkus ?? []).join(", ")}</span>,
    },
    {
      id: "total",
      header: "Nilai",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.total)}</span>,
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={`${withStore(ECOMMERCE_SKU_HREF, row.storeId)}`}
          className="text-sm font-semibold text-primary underline"
        >
          Ikat SKU
        </Link>
      ),
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
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.createdAt)}</span>,
    },
    { id: "store", header: "Toko", cell: (row) => storeName(row.storeId) },
    { id: "process", header: "Proses", cell: (row) => PROCESS_LABEL[row.process] },
    {
      id: "result",
      header: "Hasil",
      cell: (row) => <span className="text-muted">{historySummary(row)}</span>,
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
            />
            <p className="text-sm text-muted">
              Satu pesanan ditahan utuh walaupun hanya satu SKU-nya belum terikat. Begitu semua SKU-nya
              diikat, fakturnya dibuat otomatis dengan tanggal pesanan asli.
            </p>
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
