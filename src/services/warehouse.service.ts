import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

/**
 * Stock locations, against /api/warehouses.
 *
 * `list` only, for the same reason categoryService started that way: warehouses
 * are read by the catalogue's and the stock screens' pickers, and managed by no
 * screen in this frontend yet. The write endpoints exist on the backend and get
 * their methods when something calls them.
 */
export const warehouseService = {
  /**
   * GET /warehouses — the picker's list.
   *
   * `limit: 100` by default: a picker wants the whole set in one page, and a
   * tenant with more than a hundred stock locations needs a different control
   * than a dropdown anyway.
   */
  list: (query: { isActive?: boolean; search?: string; limit?: number } = {}) =>
    apiClient.get<PageResult<StockWarehouse>>("/warehouses", {
      query: {
        isActive: query.isActive,
        search: query.search,
        limit: query.limit ?? 100,
      },
    }),
};
