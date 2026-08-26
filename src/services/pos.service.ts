import { apiClient } from "./api-client";
import type {
  CloseShiftInput,
  OpenShiftInput,
  PageResult,
  PosCatalogItem,
  PosCatalogQuery,
  PosReceipt,
  PosReturn,
  PosReturnable,
  PosTransactionListQuery,
  PosShift,
  PosTransaction,
  PosXReport,
  PayInput,
  CustomerCreditStatus,
  VoidSaleInput,
  CreateReturnInput,
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
        parentId: query.parentId,
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

  /**
   * GET /pos/transactions — settled sales, for the Void list.
   *
   * Paginated, unlike `heldCarts`: a busy Saturday is hundreds of sales, and the
   * list is browsed rather than glanced at.
   */
  listTransactions: (query: PosTransactionListQuery = {}) =>
    apiClient.get<PageResult<PosTransaction>>("/pos/transactions", {
      query: {
        page: query.page,
        limit: query.limit,
        shiftId: query.shiftId,
        branchId: query.branchId,
        customerId: query.customerId,
        status: query.status,
        paidFrom: query.paidFrom,
        paidTo: query.paidTo,
      },
    }),

  /* --------------------------------------------------------- settlement */

  /**
   * POST /pos/transactions/:id/pay — take the money.
   *
   * THE ONE IRREVERSIBLE CALL IN THIS FILE. It allocates a number, moves stock
   * and posts two ledger entries; nothing after it can be undone by editing, and
   * a wrong sale is voided rather than corrected.
   *
   * The remainder must be EXACTLY zero. The till disables Selesaikan until it
   * is, and the server checks again — a client-side check is a suggestion.
   */
  /**
   * POST /pos/transactions/:id/pull-bookings — FR-3's bridge.
   *
   * IDS AND NOTHING ELSE. The lines are built on the server from the bookings
   * themselves, at the price each was QUOTED — a booking is a quote, and a
   * client that could name a price could charge whatever it liked while the sale
   * looked perfectly ordinary.
   *
   * ONE CALL DOES THREE WRITES: the lines land in the basket, the basket records
   * which bookings they came from, and the bookings are marked as pulled so the
   * bridge never offers them twice.
   */
  /**
   * GET /pos/transactions/active — the basket this cashier left open, or null.
   *
   * WHAT MAKES A RELOAD COST NOTHING. The cart lives on the server and the till
   * holds only a reference; without this, a refreshed browser would strand the
   * basket — invisible in Keranjang Tersimpan, which lists only what was PARKED
   * — and the next line would quietly open a second one beside it.
   */
  activeCart: () => apiClient.get<PosTransaction | null>("/pos/transactions/active"),

  pullBookings: (id: string, bookingIds: string[]) =>
    apiClient.post<PosTransaction>(
      `/pos/transactions/${id}/pull-bookings`,
      { bookingIds },
    ),

  pay: (id: string, input: PayInput) =>
    apiClient.post<PosTransaction>(`/pos/transactions/${id}/pay`, input),

  /**
   * GET /pos/customers/:id/credit — how much this customer may still owe (FR-7).
   *
   * ASKED BEFORE THE SALE, NOT DURING IT. The plafon is enforced when the payment
   * is taken, and a cashier who finds out there is what has already told the
   * customer the sale went through.
   *
   * ON THE POS SURFACE, gated by the till's own permission: a cashier who can
   * ring up a sale can see whether this customer may have one on account,
   * without being handed the receivables ledger.
   */
  creditStatus: (customerId: string) =>
    apiClient.get<CustomerCreditStatus>(`/pos/customers/${customerId}/credit`),

  /**
   * GET /pos/transactions/:id/receipt — the printable payload (FR-8).
   *
   * Assembled on the SERVER, which is what makes a reprint mean anything: every
   * figure comes from the stored sale, so a receipt printed today for last
   * Tuesday's sale says what it said on Tuesday.
   */
  receipt: (id: string) =>
    apiClient.get<PosReceipt>(`/pos/transactions/${id}/receipt`),

  /* ------------------------------------------------------ undoing a sale */

  /**
   * POST /pos/transactions/:id/void — cancel a sale in full (FR-11).
   *
   * Requires `posTransactions:void`, which a cashier may not hold: a void
   * reverses money already taken.
   *
   * REFUSED WITH A `409` once the sale's shift is closed, pointing at Retur.
   * Once the drawer has been counted and the variance declared, that figure is
   * what the cashier was measured against.
   */
  voidSale: (id: string, input: VoidSaleInput) =>
    apiClient.post<PosTransaction>(`/pos/transactions/${id}/void`, input),

  /**
   * GET /pos/transactions/:id/returnable — what is still returnable.
   *
   * The Retur form's source of truth. It calls the SAME rule the write enforces,
   * so the form can only ever offer what the server would accept.
   */
  returnable: (id: string) =>
    apiClient.get<PosReturnable>(`/pos/transactions/${id}/returnable`),

  /**
   * POST /pos/returns — take goods back, in part (FR-11).
   *
   * Requires `posTransactions:refund`. Partial by nature, and the refund is
   * computed by the server from what was actually PAID — never from the shelf
   * label, and never from a figure this client sends.
   */
  createReturn: (input: CreateReturnInput) =>
    apiClient.post<PosReturn>("/pos/returns", input),
};
