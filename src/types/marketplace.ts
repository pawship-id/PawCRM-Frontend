/**
 * Penjualan › E-commerce — the /api/marketplace contract (Shopee, Tahap A).
 * Mirrors the backend models in PawCRM-Backend/src/models/marketplace*.model.js.
 */

export type Marketplace = "shopee";

/** The template every stock export patches — set by the first upload. */
export interface MarketplaceTemplate {
  fileId: string;
  fileName: string;
  stockColumn: string;
  variantCount: number;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface ListingCounts {
  bound: number;
  unbound: number;
  no_sku: number;
  removed: number;
}

export interface MarketplaceStore {
  _id: string;
  marketplace: Marketplace;
  name: string;
  /** Set by the first payout report imported, then locked. */
  shopUsername: string | null;
  /** Null until the first template is uploaded; locked after. */
  shopId: string | null;
  warehouseId: string;
  /** Named by the server, so a role without Gudang still reads a name. */
  warehouseName: string | null;
  /** The warehouse's branch — what this store's invoices will carry. */
  branchId: string | null;
  branchName: string | null;
  stockBuffer: number;
  isActive: boolean;
  template: MarketplaceTemplate | null;
  lastStockExportAt: string | null;
  lastOrderImportAt?: string | null;
  lastSettlementAt?: string | null;
  /** Shopee statuses an order import turns into invoices. */
  importStatuses?: string[];
  /** The store's "Shopee – <toko>" customer, once the first import made it. */
  customerId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only on the list endpoint. */
  listingCounts?: ListingCounts;
  orderCounts?: { held: number; needsAction: number };
  /** Marketplace invoices not yet settled by a payout. */
  unpaid?: { count: number; amount: string };
}

export interface CreateMarketplaceStoreInput {
  marketplace?: Marketplace;
  name: string;
  warehouseId: string;
  /** "new" opens a "Saldo Shopee – <toko>" account; or an existing Kas & Bank account id. */
  saldoAccount?: string;
  stockBuffer?: number;
  isActive?: boolean;
}

export type UpdateMarketplaceStoreInput = Partial<
  Omit<CreateMarketplaceStoreInput, "marketplace" | "saldoAccount">
> & {
  importStatuses?: string[];
  /** Per-role account ids; null returns a role to its default. */
  accounts?: Partial<Record<AccountRole, string | null>>;
};

/** One row of Pengaturan › Akun. */
export interface StoreAccountRow {
  role: AccountRole;
  label: string;
  defaultCode: string;
  account: { _id: string; code: string; name: string };
  isDefault: boolean;
}

export interface TemplateUploadResult {
  variants: number;
  products: number;
  autoBound: number;
  bound: number;
  unbound: number;
  noSku: number;
  removed: number;
}

export type ListingStatus = "bound" | "unbound" | "no_sku" | "removed";

export interface MarketplaceListing {
  _id: string;
  storeId: string;
  productCode: string;
  variationCode: string;
  productName: string;
  variationName: string;
  parentSku: string;
  variationSku: string;
  /** What an order line carries; null when Shopee holds no SKU. */
  shopeeSku: string | null;
  templatePrice: string;
  templateStock: string;
  rowNumber: number;
  inCurrentTemplate: boolean;
  productId: string | null;
  status: ListingStatus;
  product: { _id: string; name: string; sku: string; isActive: boolean } | null;
  /** Whole units at the store's warehouse; null when unbound. */
  stock: number | null;
  /** What the next export writes: stock − buffer, never below 0. */
  exportStock: number | null;
}

export interface ListingListQuery {
  page?: number;
  limit?: number;
  status?: ListingStatus | "";
  search?: string;
}

export interface ListingPage {
  items: MarketplaceListing[];
  counts: ListingCounts;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface BindResult {
  listing: MarketplaceListing;
  /** Every listing of the store with the same Shopee SKU moved together. */
  affectedListings: number;
  /** Held orders this bind turned into invoices. */
  released?: ReleasedOrder[];
}

export type StockChange = "changed" | "same";

export interface StockExportCounts {
  changed: number;
  same: number;
  /** Template rows returned untouched — unbound or without a SKU. */
  unbound: number;
}

export interface StockExportRow {
  listingId: string;
  rowNumber: number;
  shopeeSku: string;
  productName: string;
  variationName: string;
  productId: string;
  /** Harga in the saved template, as Shopee wrote it — never changed by the export. */
  templatePrice: string;
  templateStock: number | null;
  onHand: number;
  exportStock: number;
  change: StockChange;
  product: { _id: string; name: string; sku: string } | null;
}

export interface StockExportPreview {
  warehouseId: string;
  stockBuffer: number;
  template: MarketplaceTemplate;
  counts: StockExportCounts;
  items: StockExportRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface StockExportResult {
  batchId: string;
  fileName: string;
  counts: StockExportCounts;
}

export type MarketplaceProcess = "template" | "stock_export" | "orders" | "settlement";

export interface MarketplaceHistoryEntry {
  _id: string;
  storeId: string;
  process: MarketplaceProcess;
  fileId: string | null;
  fileName: string | null;
  result: Partial<TemplateUploadResult> &
    Partial<StockExportCounts> &
    Partial<OrderImportCounts> & {
      warehouseId?: string;
      stockBuffer?: number;
      templateFileName?: string;
      created?: number;
      flagged?: number;
      failed?: number;
      match?: number;
      variance?: number;
      not_found?: number;
      already_paid?: number;
      settled?: number;
      number?: string;
    };
  documents?: Array<{ kind: string; id: string; number: string | null; ref: string | null }>;
  createdBy: string | null;
  /** Who ran it — resolved by the server for the Oleh column. */
  createdByName?: string | null;
  createdAt: string;
}

// ── Tahap B — impor pesanan ────────────────────────────────────────────────

export type ShopeeOrderStatus =
  | "Belum Bayar"
  | "Perlu Dikirim"
  | "Sedang Dikirim"
  | "Telah Dikirim"
  | "Selesai"
  | "Batal";

/** What a preview decided for one order. */
export type OrderImportCategory = "new" | "held" | "needs_action" | "existing" | "skipped";

export interface OrderPreviewItem {
  orderNo: string;
  category: OrderImportCategory;
  status: string;
  reason: string | null;
  paidAt: string | null;
  /** The invoice value: Σ subtotal − seller voucher. */
  total: number;
  lineCount: number;
  /** What was bought, as the order file names it — for the Barang column. */
  items: Array<{ productName: string; variationName: string; qty: number }>;
  unboundSkus: string[];
  invoiceNumber: string | null;
}

export interface OrderImportCounts {
  new: number;
  held: number;
  needs_action: number;
  existing: number;
  skipped: number;
}

export interface OrderImportPreview {
  batchId: string;
  fileName: string;
  counts: OrderImportCounts;
  items: OrderPreviewItem[];
  /** "File ini mungkin dari toko lain" — most SKUs unknown to this store. */
  warning: string | null;
}

export interface OrderImportResult {
  batchId: string;
  created: Array<{ orderNo: string; invoiceId: string; invoiceNumber: string }>;
  held: number;
  flagged: number;
  failed: Array<{ orderNo: string; message: string }>;
}

export interface MarketplaceOrderRecord {
  _id: string;
  storeId: string;
  orderNo: string;
  state: "held" | "invoiced" | "cancelled";
  invoiceId: string | null;
  invoiceNumber: string | null;
  needsAction: "cancelled_after_invoice" | null;
  shopeeStatus: string | null;
  orderedAt: string | null;
  paidAt: string | null;
  total: number;
  sellerVoucher?: number;
  /** Username (Pembeli) from the order file. */
  buyerUsername?: string | null;
  /** The order file this came in with. */
  sourceFileName?: string | null;
  lines?: Array<{
    sku: string | null;
    productName: string;
    variationName: string;
    qty: number;
    originalPrice?: number;
    sellerDiscount?: number;
    subtotal: number;
  }>;
  /** Held only: the SKUs of this order still unbound. */
  unboundSkus?: string[];
  /** Needs action only: the invoice's payment state. */
  invoiceStatus?: string | null;
}

/** Bind answers also carry held orders that just became invoices. */
export interface ReleasedOrder {
  orderNo: string;
  invoiceId: string;
  invoiceNumber: string;
}

// ── Tahap C — impor pencairan ──────────────────────────────────────────────

export type SettlementCategory = "match" | "variance" | "not_found" | "already_paid";

export interface SettlementPreviewItem {
  orderNo: string;
  releasedAt: string | null;
  category: SettlementCategory;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceValue: number | null;
  comparisonValue: number;
  variance: number;
  netReleased: number;
  notes: string[];
}

export interface SettlementJournalLine {
  role: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface SettlementPreview {
  batchId: string;
  fileName: string;
  username: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  totalReleased: number;
  counts: Record<SettlementCategory, number>;
  items: SettlementPreviewItem[];
  journal: SettlementJournalLine[];
  /** Amount released for orders that will be settled now. */
  settlingReleased: number;
}

export interface SettlementResult {
  batchId: string;
  settlementId: string;
  number: string;
  settled: number;
}

export type AccountRole =
  | "receivable"
  | "saldo"
  | "promo"
  | "voucher"
  | "admin"
  | "program"
  | "shipping"
  | "pph22"
  | "variance";
