import type { ListingStatus, MarketplaceProcess } from "@/types/marketplace";

/** The module's routes. Ringkasan predates Penjualan and keeps its old path. */
export const ECOMMERCE_HREF = "/dashboard/ecommerce-sync";
export const ECOMMERCE_SKU_HREF = `${ECOMMERCE_HREF}/sku`;
export const ECOMMERCE_SETTINGS_HREF = `${ECOMMERCE_HREF}/settings`;

/** A sub-route with the store it should open on. */
export function withStore(href: string, storeId: string | null | undefined): string {
  return storeId ? `${href}?store=${encodeURIComponent(storeId)}` : href;
}

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  bound: "Terikat",
  unbound: "Belum terikat",
  no_sku: "Tanpa SKU",
  removed: "Tidak ada di template",
};

export const LISTING_STATUS_TONE: Record<ListingStatus, string> = {
  bound: "bg-tint-success text-success",
  unbound: "bg-tint-neutral text-muted",
  no_sku: "bg-tint-warning text-warning",
  removed: "bg-tint-neutral text-muted",
};

export const PROCESS_LABEL: Record<MarketplaceProcess, string> = {
  template: "Upload template",
  stock_export: "Ekspor stok",
  orders: "Impor pesanan",
  settlement: "Impor pencairan",
};

/** "Rp 1.234.567" from Shopee's whole-rupiah numbers or a decimal string. */
export function formatRupiah(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  return `${number < 0 ? "−" : ""}Rp${Math.abs(Math.round(number)).toLocaleString("id-ID")}`;
}

export const ORDER_STATUSES = [
  "Perlu Dikirim",
  "Sedang Dikirim",
  "Telah Dikirim",
  "Selesai",
] as const;

export const INVOICE_HREF = (id: string) => `/dashboard/sales/invoice/${id}`;

export const MARKETPLACE_LABEL = { shopee: "Shopee" } as const;

const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "28 Okt 2026, 14.30" — every timestamp on these screens. */
export function formatDateTime(value: string | null | undefined): string {
  return value ? DATE_TIME.format(new Date(value)) : "—";
}

export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("id-ID");
}

/** Shopee's template prices are whole rupiah as text — "215000". */
export function formatTemplatePrice(value: string): string {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) ? `Rp${number.toLocaleString("id-ID")}` : "—";
}
