import { apiClient } from "./api-client";
import type { Branch, PageResult } from "@/types/api";

/**
 * Read-only branch lookups against /api/branches.
 *
 * Used by the user branch-scope picker to list branches by name. As with roles,
 * branch CRUD is a separate master-data screen; here we only ever list.
 * `limit: 100` pulls the full set in one page.
 */
export const branchService = {
  /** GET /branches — all branches for the current tenant. */
  list: () =>
    apiClient.get<PageResult<Branch>>("/branches", { query: { limit: 100 } }),
};
