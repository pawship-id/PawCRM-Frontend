import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  BindResult,
  CreateMarketplaceStoreInput,
  ListingListQuery,
  ListingPage,
  MarketplaceHistoryEntry,
  MarketplaceOrderRecord,
  MarketplaceProcess,
  OrderImportPreview,
  OrderImportResult,
  SettlementPreview,
  SettlementResult,
  StoreAccountRow,
  MarketplaceStore,
  StockChange,
  StockExportPreview,
  StockExportResult,
  TemplateUploadResult,
  UpdateMarketplaceStoreInput,
} from "@/types/marketplace";

/**
 * Penjualan › E-commerce calls against /api/marketplace (Shopee, Tahap A).
 *
 * A stock export is two calls on purpose: the POST records the file and
 * answers with its history id, and `downloadHistoryFile` fetches it — the same
 * GET "Unduh ulang" uses, so there is one download path.
 */
export const marketplaceService = {
  listStores: () => apiClient.get<MarketplaceStore[]>("/marketplace/stores"),

  getStore: (id: string) => apiClient.get<MarketplaceStore>(`/marketplace/stores/${id}`),

  createStore: (input: CreateMarketplaceStoreInput) =>
    apiClient.post<MarketplaceStore>("/marketplace/stores", input),

  updateStore: (id: string, patch: UpdateMarketplaceStoreInput) =>
    apiClient.patch<MarketplaceStore>(`/marketplace/stores/${id}`, patch),

  /** POST /stores/:id/template — the Shopee mass-update file, as multipart. */
  uploadTemplate: (id: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiClient.post<{
      store: MarketplaceStore;
      result: TemplateUploadResult;
      batchId: string;
    }>(`/marketplace/stores/${id}/template`, body, { timeoutMs: 60_000 });
  },

  listListings: (storeId: string, query: ListingListQuery = {}) =>
    apiClient.get<ListingPage>(`/marketplace/stores/${storeId}/listings`, {
      query: {
        page: query.page,
        limit: query.limit,
        status: query.status || undefined,
        search: query.search || undefined,
      },
    }),

  bindListing: (storeId: string, listingId: string, productId: string) =>
    apiClient.post<BindResult>(
      `/marketplace/stores/${storeId}/listings/${listingId}/bind`,
      { productId },
    ),

  unbindListing: (storeId: string, listingId: string) =>
    apiClient.post<BindResult>(`/marketplace/stores/${storeId}/listings/${listingId}/unbind`),

  previewStockExport: (
    storeId: string,
    query: { page?: number; limit?: number; status?: StockChange | "" } = {},
  ) =>
    apiClient.get<StockExportPreview>(`/marketplace/stores/${storeId}/stock-export/preview`, {
      query: { page: query.page, limit: query.limit, status: query.status || undefined },
    }),

  generateStockExport: (storeId: string) =>
    apiClient.post<StockExportResult>(`/marketplace/stores/${storeId}/stock-export`, undefined, {
      timeoutMs: 60_000,
    }),

  getAccounts: (storeId: string) =>
    apiClient.get<StoreAccountRow[]>(`/marketplace/stores/${storeId}/accounts`),

  /** POST /stores/:id/orders/preview — sorts the order export; writes only a draft. */
  previewOrders: (storeId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiClient.post<OrderImportPreview>(`/marketplace/stores/${storeId}/orders/preview`, body, {
      timeoutMs: 60_000,
    });
  },

  commitOrders: (storeId: string, batchId: string) =>
    apiClient.post<OrderImportResult>(
      `/marketplace/stores/${storeId}/orders/${batchId}/commit`,
      undefined,
      { timeoutMs: 120_000 },
    ),

  listHeldOrders: (storeId?: string) =>
    apiClient.get<MarketplaceOrderRecord[]>("/marketplace/orders/held", { query: { storeId } }),

  listNeedsAction: (storeId?: string) =>
    apiClient.get<MarketplaceOrderRecord[]>("/marketplace/orders/needs-action", {
      query: { storeId },
    }),

  previewSettlement: (storeId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiClient.post<SettlementPreview>(
      `/marketplace/stores/${storeId}/settlements/preview`,
      body,
      { timeoutMs: 60_000 },
    );
  },

  commitSettlement: (storeId: string, batchId: string) =>
    apiClient.post<SettlementResult>(
      `/marketplace/stores/${storeId}/settlements/${batchId}/commit`,
      undefined,
      { timeoutMs: 120_000 },
    ),

  listHistory: (query: {
    storeId?: string;
    process?: MarketplaceProcess;
    page?: number;
    limit?: number;
  } = {}) =>
    apiClient.get<PageResult<MarketplaceHistoryEntry>>("/marketplace/history", {
      query: {
        storeId: query.storeId,
        process: query.process,
        page: query.page,
        limit: query.limit,
      },
    }),

  downloadHistoryFile: (batchId: string, fallbackFilename = "shopee.xlsx") =>
    apiClient.download(`/marketplace/history/${batchId}/file`, {
      fallbackFilename,
      timeoutMs: 60_000,
    }),
};
