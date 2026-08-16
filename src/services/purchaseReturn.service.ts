import { apiClient } from "./api-client";
import type {
  CreatePurchaseReturnInput,
  PageResult,
  PurchaseReturnDetail,
  PurchaseReturnListQuery,
  PurchaseReturnListRow,
  PurchaseReturnPreview,
  UpdatePurchaseReturnInput,
} from "@/types/api";

/**
 * Purchase returns, against /api/purchase-returns.
 *
 * THE WORKFLOW IS THE METHOD LIST, and it is the stock opname's rather than the
 * goods receipt's: a return is opened as a draft, edited by `update` while the
 * boxes are being sorted, previewed, and submitted exactly once. There is
 * deliberately no `unsubmit` and no `restore` — submitting posts stock movements
 * and a journal entry that are both immutable, so a return that could go back to
 * draft would claim to describe goods whose departure had already been booked. A
 * wrong return is corrected by receiving the goods back in.
 *
 * THIS FILE USED TO BE READ-ONLY, wrapping `list` alone, because the screens that
 * return goods still ran on the prototype store and two ways to return goods in
 * one codebase is worse than one incomplete way. Those screens now run on this,
 * so the writes are here.
 *
 * NOTHING HERE COMPUTES A COST. A client sends which receipt line, how many, and
 * why; the product, the lot, the unit cost and the subtotal all come back copied
 * from the traced line. That is the entire point of the module — the price a
 * delivery ACTUALLY charged is what the weighted average must be reversed at, and
 * a client that could type it could restate the cost basis every later sale is
 * costed at.
 *
 * Mirrors stockOpnameService: each method maps one typed domain operation onto a
 * single apiClient request — no React, no state. The tenant scope is derived from
 * the session cookie by the backend, so it is never passed here.
 */
export const purchaseReturnService = {
  /**
   * GET /purchase-returns — returns, newest first, filterable.
   *
   * HEADERS ONLY: the API projects `items` away and replaces them with
   * `itemCount`, so a page of twenty returns is not hundreds of costs nobody on
   * that screen reads. `supplierName`, `warehouseName` and `originalReceiptNumber`
   * come back resolved, so the list renders in full without a second request.
   *
   * `originalReceiptId` is how a goods receipt finds its own returns — the
   * question somebody reading a delivery asks before raising another one.
   */
  list: (query: PurchaseReturnListQuery = {}) =>
    apiClient.get<PageResult<PurchaseReturnListRow>>("/purchase-returns", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
        originalReceiptId: query.originalReceiptId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sort: query.sort,
      },
    }),

  /**
   * GET /purchase-returns/:id — one return, WITH its lines and their labels.
   *
   * `productSku`, `productName`, `productUnit`, `batchCode` and `batchExpiryDate`
   * arrive resolved, so the screen neither renders ObjectIds nor fetches the
   * catalogue alongside the document.
   *
   * 404s for another tenant's return exactly as for an unknown id, which is the
   * intended answer: a 403 would confirm the id exists.
   */
  getById: (id: string) =>
    apiClient.get<PurchaseReturnDetail>(`/purchase-returns/${id}`),

  /**
   * POST /purchase-returns — open a draft (201). Moves nothing.
   *
   * The return NUMBER is allocated here rather than at submit, because a clerk on
   * the phone to a vendor needs one to quote before the goods have gone anywhere.
   *
   * AT LEAST ONE LINE IS REQUIRED, which is what makes this flow differ from the
   * opname it otherwise mirrors: there is no "open the sheet, then fill it in".
   * A return is raised because somebody is already holding the damaged carton.
   */
  create: (input: CreatePurchaseReturnInput) =>
    apiClient.post<PurchaseReturnDetail>("/purchase-returns", input),

  /**
   * PATCH /purchase-returns/:id — edit a draft.
   *
   * `items` REPLACES the array, so the whole line list goes up on every save. 409
   * when the return was submitted mid-edit, which is reported rather than retried:
   * the quantities are already in the ledger, and silently discarding the edit
   * would tell the storekeeper their last few minutes of work were saved.
   *
   * Every line is revalidated against the receipt INCLUDING the returnable
   * ceiling, because another return against the same delivery may have submitted
   * since this draft was opened.
   */
  update: (id: string, input: UpdatePurchaseReturnInput) =>
    apiClient.patch<PurchaseReturnDetail>(`/purchase-returns/${id}`, input),

  /**
   * POST /purchase-returns/:id/preview — what submitting would post, without
   * posting it. 200, not 201: it makes nothing.
   *
   * GATED ON `purchaseReturns:submit` RATHER THAN `read`, and callers must handle
   * that: a role holding create/read/update — the seeded Staff role — can build a
   * draft and will get a 403 from here. The screen hides the panel for them
   * instead of painting an error over a page that is otherwise working.
   *
   * It refuses exactly what the submit refuses, so a client that can preview can
   * trust that submitting will not then be turned away for a reason the preview
   * never mentioned.
   */
  preview: (id: string) =>
    apiClient.post<PurchaseReturnPreview>(`/purchase-returns/${id}/preview`),

  /**
   * POST /purchase-returns/:id/submit — IRREVERSIBLE.
   *
   * Takes the stock out of the named lots, reverses the weighted average at the
   * ORIGINAL purchase price, and — unless the goods came in on consignment —
   * debits the supplier's payable. 200 rather than 201: it transitions a return
   * that already exists.
   *
   * NOT IDEMPOTENT from a caller's point of view even though the server guards it
   * twice: callers lock their submit control for the whole flight rather than
   * relying on a 409 to explain a double click.
   */
  submit: (id: string) =>
    apiClient.post<PurchaseReturnDetail>(`/purchase-returns/${id}/submit`),

  /**
   * DELETE /purchase-returns/:id — soft delete, DRAFTS ONLY.
   *
   * 409 for a submitted return: it is the supporting document for movements and a
   * journal entry that are both immutable, and deleting it would leave the ledger
   * pointing at a reference nobody can look up while the stock and the discharged
   * debt remained.
   *
   * Discarding a draft frees nothing, because a draft never reserved anything —
   * only submitted returns consume a line's returnable allowance.
   */
  remove: (id: string) =>
    apiClient.delete<PurchaseReturnDetail>(`/purchase-returns/${id}`),
};
