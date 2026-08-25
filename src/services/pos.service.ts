import { apiClient } from "./api-client";
import type {
  CloseShiftInput,
  OpenShiftInput,
  PageResult,
  PosCatalogItem,
  PosCatalogQuery,
  PosShift,
  PosTransaction,
  PosXReport,
  UpdateCartInput,
} from "@/types/api";

/**
 * The till's calls against /api/pos.
 *
 * TAKING MONEY IS NOT HERE. Payment, the journal entry and the stock movements
 * are Fase 7; everything below happens before the customer has paid, which is
 * why nothing in it is irreversible.
 *
 * MONEY CROSSES THE WIRE AS STRINGS in both directions, and nothing in this file
 * parses one. A component that needs to show an amount formats the string; one
 * that needs arithmetic on it has a bug worth noticing rather than papering over.
 */
export const posService = {
  /* ----------------------------------------------------------- shifts */

  /**
   * POST /pos/shifts — Buka Kasir.
   *
   * `cashierUserId` is not sent and would be ignored: the cashier is the acting
   * user, because a shift opened in somebody else's name is a cash variance
   * assigned to somebody else.
   */
  openShift: (input: OpenShiftInput) =>
    apiClient.post<PosShift>("/pos/shifts", input),

  /**
   * GET /pos/shifts/current — the caller's own open shift, or `null`.
   *
   * NULL IS A 200, not a 404. Not having opened the till is the ordinary state
   * of every morning, and this is what the screen asks on load to decide whether
   * to show the gate.
   */
  currentShift: () => apiClient.get<PosShift | null>("/pos/shifts/current"),

  /** GET /pos/shifts/:id/x-report — read-only, and safe to run repeatedly. */
  xReport: (shiftId: string) =>
    apiClient.get<PosXReport>(`/pos/shifts/${shiftId}/x-report`),

  /**
   * POST /pos/shifts/:id/close — Tutup Kasir.
   *
   * Requires `posShifts:close`, which a cashier may not hold: counting the
   * drawer is often a supervisor's job (FR-9). A large variance does NOT block
   * the close — it is marked, not refused.
   */
  closeShift: (shiftId: string, input: CloseShiftInput) =>
    apiClient.post<PosShift>(`/pos/shifts/${shiftId}/close`, input),

  /* -------------------------------------------------------- catalogue */

  /**
   * GET /pos/catalog — products and services in one paginated grid.
   *
   * The warehouse is NOT a parameter: it comes from the shift, because the stock
   * badge answers "can I sell this right now" and that is a question about one
   * shelf.
   */
  catalog: (query: PosCatalogQuery = {}) =>
    apiClient.get<PageResult<PosCatalogItem>>("/pos/catalog", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        categoryId: query.categoryId,
        // An array becomes repeated params — see buildUrl in api-client.ts.
        kinds: query.kinds,
      },
    }),

  /* ------------------------------------------------------------- cart */

  /** POST /pos/transactions — an empty cart bound to the shift. */
  createCart: (input: { customerId?: string | null; heldLabel?: string | null } = {}) =>
    apiClient.post<PosTransaction>("/pos/transactions", input),

  /** GET /pos/transactions/:id */
  getCart: (id: string) => apiClient.get<PosTransaction>(`/pos/transactions/${id}`),

  /**
   * PATCH /pos/transactions/:id — prices the WHOLE basket.
   *
   * Not a per-line verb, and that is the server's design rather than this
   * client's convenience: a cart discount is measured against the
   * post-item-discount subtotal, so changing one line changes what every other
   * figure means.
   *
   * A discount past the cashier's 10% limit comes back as a `409` until an
   * `approvedBy` is supplied.
   */
  updateCart: (id: string, patch: UpdateCartInput) =>
    apiClient.patch<PosTransaction>(`/pos/transactions/${id}`, patch),

  /**
   * GET /pos/transactions/held — the shift's parked baskets (FR-6).
   *
   * A bare array, not a page: a till with more parked carts than fit on a screen
   * has a workflow problem a pager would hide rather than solve.
   */
  heldCarts: () => apiClient.get<PosTransaction[]>("/pos/transactions/held"),

  /**
   * DELETE /pos/transactions/:id — discards a PARKED cart.
   *
   * Refuses anything paid with a `409`: a paid sale is voided, never deleted.
   */
  discardCart: (id: string) =>
    apiClient.delete<PosTransaction>(`/pos/transactions/${id}`),
};
