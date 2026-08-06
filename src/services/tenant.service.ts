import { apiClient } from "./api-client";
import type { Tenant } from "@/types/api";

/**
 * Tenant calls against /api/tenants.
 *
 * Only the tenant-facing half of that router is exposed here. The rest of it
 * (create, list, update, soft-delete) is platform-owner administration of OTHER
 * businesses — a surface this dashboard is not, and adding a method for it here
 * would invite a screen that has no business existing in a tenant's own app.
 */
export const tenantService = {
  /**
   * GET /tenants/me — the signed-in user's own business.
   *
   * There is no id parameter by design: the backend resolves the tenant from the
   * session cookie, so this call cannot be aimed at another business. Requires
   * `tenants:read`; a role without it gets a 403 ApiError.
   */
  me: () => apiClient.get<Tenant>("/tenants/me"),
};
