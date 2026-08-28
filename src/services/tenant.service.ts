import { apiClient } from "./api-client";
import type { Tenant, TenantSettings } from "@/types/api";

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

  /**
   * PATCH /tenants/me — the signed-in business editing its OWN settings.
   *
   * NOT `PATCH /tenants/:id`, which is the platform-owner route and is **still
   * unguarded** on the server: it takes an id, and pointing a tenant dashboard at
   * it would let any caller rename or re-plan any business. This one takes no id
   * at all — the tenant comes from the session cookie — and accepts nothing but
   * `settings`.
   *
   * Requires `tenants:update`, a different grant from the `read` that opens the
   * business page: `priceIncludesTax` decides whether a shelf price already
   * contains the tax, so changing it changes what customers are charged.
   */
  updateSettings: (settings: Partial<TenantSettings>) =>
    apiClient.patch<Tenant>("/tenants/me", { settings }),
};
