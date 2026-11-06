import type { ListingStatus, Marketplace, MarketplaceProcess } from "@/types/marketplace";

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
  suggested: "Saran",
  unbound: "Belum terikat",
  no_sku: "Tanpa SKU",
  removed: "Tidak ada di template",
};

export const LISTING_STATUS_TONE: Record<ListingStatus, string> = {
  bound: "bg-tint-success text-success",
  suggested: "bg-tint-info text-info",
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

/** "Rp 1.234.567" from a marketplace's whole-rupiah numbers or a decimal string. */
export function formatRupiah(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  return `${number < 0 ? "−" : ""}Rp${Math.abs(Math.round(number)).toLocaleString("id-ID")}`;
}

/** Shopee's statuses an import may turn into invoices (Belum Bayar and Batal never). */
export const ORDER_STATUSES = [
  "Perlu Dikirim",
  "Sedang Dikirim",
  "Telah Dikirim",
  "Selesai",
] as const;

/**
 * What differs between marketplaces on these screens — the words, the file
 * each step takes and where to get it. Mirrors utils/marketplace/profiles.js
 * on the backend. TikTok: one Seller Center serves the TikTok app and
 * Tokopedia, so one store covers both (BO, 5 Nov 2026).
 */
export interface MarketplaceProfile {
  /** "Shopee", "Tokopedia & TikTok Shop" — the marketplace's full name. */
  label: string;
  /** "Shopee", "TikTok" — inside a sentence: "varian TikTok", "Status TikTok". */
  short: string;
  customerPrefix: string;
  saldoPrefix: string;
  /** Statuses an import may turn into invoices. */
  orderStatuses: readonly string[];
  neverInvoiced: string;
  /** Whether the template carries a shop id that locks the store. */
  hasShopId: boolean;
  templateName: string;
  templateDownload: string;
  templateUpload: string;
  orderFileName: string;
  orderDownload: string;
  incomeFileName: string;
  incomeDownload: string;
  /** The name the payout report gives its total. */
  incomeTotalLabel: string;
}

export const MARKETPLACE_PROFILES: Record<Marketplace, MarketplaceProfile> = {
  shopee: {
    label: "Shopee",
    short: "Shopee",
    customerPrefix: "Shopee",
    saldoPrefix: "Saldo Shopee",
    orderStatuses: ORDER_STATUSES,
    neverInvoiced: "Belum Bayar dan Batal",
    hasShopId: true,
    templateName: "template Shopee",
    templateDownload: "Seller Centre › Produk Saya › Ubah Massal › Info Penjualan › Unduh",
    templateUpload: "Seller Centre › Produk Saya › Ubah Massal › Unggah",
    orderFileName: "file pesanan Shopee",
    orderDownload: "Seller Centre › Pesanan Saya › Ekspor",
    incomeFileName: "Laporan Penghasilan Shopee",
    incomeDownload: "Seller Centre › Keuangan › Penghasilan Saya › Sudah Dilepas › Ekspor",
    incomeTotalLabel: "Total yang Dilepas",
  },
  tiktok: {
    label: "Tokopedia & TikTok Shop",
    short: "TikTok",
    customerPrefix: "Tokopedia & TikTok Shop",
    saldoPrefix: "Saldo TikTok",
    orderStatuses: ["Perlu dikirim", "Menunggu diambil", "Dikirim", "Selesai"],
    neverInvoiced: "Belum dibayar dan Dibatalkan",
    hasShopId: false,
    templateName: "template TikTok",
    templateDownload:
      "TikTok Seller Center › Produk › Alat Pengelolaan Massal › Ubah Produk Massal › Informasi Penjualan › Unduh",
    templateUpload: "TikTok Seller Center › Produk › Alat Pengelolaan Massal › Ubah Produk Massal › Unggah",
    orderFileName: "file pesanan TikTok",
    orderDownload: "TikTok Seller Center › Pesanan › Semua pesanan › Ekspor",
    incomeFileName: "laporan pencairan TikTok",
    incomeDownload: "TikTok Seller Center › Keuangan › Penghasilan › Unduh",
    incomeTotalLabel: "Jumlah penyelesaian pembayaran",
  },
};

export function marketplaceProfile(marketplace: Marketplace | null | undefined): MarketplaceProfile {
  return MARKETPLACE_PROFILES[marketplace ?? "shopee"] ?? MARKETPLACE_PROFILES.shopee;
}

/** TikTok: the app an order was placed in. */
export const CHANNEL_LABEL: Record<string, string> = {
  tokopedia: "Tokopedia",
  tiktok_shop: "TikTok Shop",
};

export function channelLabel(channel: string | null | undefined): string | null {
  return channel ? (CHANNEL_LABEL[channel] ?? channel) : null;
}

export const SETTLEMENT_HREF = (id: string) => `${ECOMMERCE_HREF}/settlements/${id}`;
export const INVOICE_HREF = (id: string) => `/dashboard/sales/invoice/${id}`;
export const INVOICE_PAYMENT_HREF = (invoiceId: string, paymentId: string) =>
  `${INVOICE_HREF(invoiceId)}/payments/${paymentId}`;

export const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  shopee: "Shopee",
  tiktok: "Tokopedia & TikTok Shop",
};

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

const DATE_ONLY = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

/** "22 Okt 2026" — where the time adds nothing. */
export function formatDate(value: string | null | undefined): string {
  return value ? DATE_ONLY.format(new Date(value)) : "—";
}

export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("id-ID");
}

/** Template prices are whole rupiah as text — "215000". */
export function formatTemplatePrice(value: string): string {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) ? `Rp${number.toLocaleString("id-ID")}` : "—";
}
