import { apiClient } from "./api-client";
import type { Role, PageResult } from "@/types/api";

/**
 * Read-only role lookups against /api/roles.
 *
 * The user screens only need to LIST roles to populate the role picker and show
 * a role's name — role CRUD lives in its own (not-yet-built) master-data screen.
 * `limit: 100` fetches the whole set in one page: a tenant has a handful of
 * roles, so there is no pager here.
 */
export const roleService = {
  /** GET /roles — all roles for the current tenant. */
  list: () => apiClient.get<PageResult<Role>>("/roles", { query: { limit: 100 } }),
};
