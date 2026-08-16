import { apiClient } from "./api-client";
import type {
  CreateSupplierInput,
  PageResult,
  Supplier,
  SupplierListQuery,
  UpdateSupplierInput,
} from "@/types/api";

/**
 * Supplier master-data calls against /api/suppliers.
 *
 * Mirrors customerService: each method maps one typed domain operation onto a
 * single apiClient request — no React, no state. The tenant scope is derived
 * from the session cookie by the backend, so it is never passed here.
 *
 * A supplier has TWO lifecycle axes, unlike a customer, and they need different
 * calls:
 *   `update({ isActive })` — stop buying from this vendor. The record and its
 *                            history stand; it drops out of the purchasing
 *                            pickers and the API refuses new receipts against
 *                            it. Deactivating is an ordinary field edit, which
 *                            is why there is no `deactivate()` here.
 *   `remove` / `restore`   — the soft delete. Hidden from ordinary reads.
 * See the `Supplier` type for why the two are kept apart.
 */
export const supplierService = {
  /**
   * GET /suppliers — paginated, filterable list.
   *
   * `isActive` is TRI-STATE: omit it for both (the management list, which has to
   * show a deactivated vendor so somebody can reactivate it), pass `true` for the
   * pickers. apiClient drops the undefined entries, so an omitted filter never
   * reaches the query string.
   */
  list: (query: SupplierListQuery = {}) =>
    apiClient.get<PageResult<Supplier>>("/suppliers", {
      query: {
        page: query.page,
        limit: query.limit,
        type: query.type,
        search: query.search,
        isActive: query.isActive,
        includeDeleted: query.includeDeleted,
        sort: query.sort,
      },
    }),

  /** GET /suppliers/:id — a single supplier. */
  getById: (id: string) => apiClient.get<Supplier>(`/suppliers/${id}`),

  /** POST /suppliers — create a supplier (201). `name` and `type` are required. */
  create: (input: CreateSupplierInput) =>
    apiClient.post<Supplier>("/suppliers", input),

  /**
   * PATCH /suppliers/:id — update editable fields (send only what changed).
   *
   * May 409 when the name or the NPWP is already held by another active
   * supplier; the message names the offending field.
   */
  update: (id: string, patch: UpdateSupplierInput) =>
    apiClient.patch<Supplier>(`/suppliers/${id}`, patch),

  /**
   * DELETE /suppliers/:id — soft delete (returns the deleted supplier).
   *
   * Never refused for having history: receipts and invoices keep pointing at a
   * soft-deleted supplier and keep reading correctly. `isActive` is untouched, so
   * a restore brings the vendor back in the state it was deleted in.
   */
  remove: (id: string) => apiClient.delete<Supplier>(`/suppliers/${id}`),

  /**
   * PATCH /suppliers/:id/restore — undo a soft delete.
   *
   * May 409: deleting frees the name and the NPWP, so either can have been taken
   * by another supplier in the meantime.
   */
  restore: (id: string) => apiClient.patch<Supplier>(`/suppliers/${id}/restore`),
};
