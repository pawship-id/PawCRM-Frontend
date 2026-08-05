import { apiClient } from "./api-client";
import type {
  CreateOpnameInput,
  Opname,
  OpnameListQuery,
  OpnamePage,
  OpnameSubmitPreview,
  UpdateOpnameInput,
} from "@/types/inventory";

/**
 * Physical stock counts, against /api/stock-opnames.
 *
 * One typed domain operation per apiClient request, no React and no state, like
 * every other service here. The tenant scope comes from the session cookie on
 * the backend, so it is never passed.
 *
 * THE WORKFLOW IS THE METHOD LIST. A sheet is created as a draft, saved by
 * `update` as many times as the counting takes, previewed, and submitted exactly
 * once. There is deliberately no `unsubmit` and no `restore`: submitting posts
 * adjustment movements and a journal entry that are both immutable, so a sheet
 * that could go back to draft would claim to describe a count whose corrections
 * had already been booked. A wrong count is corrected by taking another one.
 *
 * NOTHING HERE COMPUTES A DIFFERENCE. `physicalQty` goes up, and every other
 * quantity — the system quantity, the variance, its value, the sheet total —
 * comes back computed. That is not politeness: the system quantity is RE-READ at
 * submit, because a draft may sit open for hours while the shop keeps selling,
 * and a browser diffing against the number it was handed this morning would book
 * those sales a second time as shrinkage.
 */
export const stockOpnameService = {
  /**
   * GET /stock-opnames — a page of count sheets, newest first.
   *
   * HEADERS ONLY: the API projects `items` away, because a page of twenty sheets
   * carrying a thousand lines each is megabytes of quantities nobody on that
   * screen reads. `itemCount`, `countedCount` and `warehouseName` come back
   * resolved so the list still renders in full without fetching a single sheet.
   */
  list: (query: OpnameListQuery = {}) =>
    apiClient.get<OpnamePage>("/stock-opnames", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        warehouseId: query.warehouseId,
        status: query.status,
        categoryFilter: query.categoryFilter,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        includeDeleted: query.includeDeleted,
      },
    }),

  /**
   * GET /stock-opnames/:id — one sheet WITH its lines and their labels.
   *
   * `productSku`, `productName`, `productUnit` and `productHasExpiry` arrive
   * resolved, so the sheet neither renders ObjectIds nor fetches the catalogue
   * alongside itself to learn which lines will need a batch code.
   */
  getById: (id: string) => apiClient.get<Opname>(`/stock-opnames/${id}`),

  /**
   * POST /stock-opnames — open a draft (201).
   *
   * OMIT `items` FOR THE ORDINARY CASE. The server fills the sheet with every
   * active stock-tracking product at the warehouse, narrowed by
   * `categoryFilter`, each line pre-filled with the system quantity. Sending
   * `items` is the deliberate partial count ("just the vaccines fridge").
   *
   * 409 when a draft is already open for that warehouse — the refusal's `reason`
   * names the blocking sheet, which is what a user needs to go and find it.
   */
  create: (input: CreateOpnameInput) =>
    apiClient.post<Opname>("/stock-opnames", input),

  /**
   * PATCH /stock-opnames/:id — the auto-save. Drafts only.
   *
   * `items` REPLACES the array, so the whole sheet goes up on every save. 409
   * when the sheet was submitted mid-edit, which is reported rather than
   * retried: the quantities are already in the ledger, and silently discarding
   * the edit would tell the counter their last few minutes of work were saved.
   */
  update: (id: string, input: UpdateOpnameInput) =>
    apiClient.patch<Opname>(`/stock-opnames/${id}`, input),

  /**
   * POST /stock-opnames/:id/preview — what submitting would post, without
   * posting it. 200, not 201: it makes nothing.
   *
   * Gated on `stockOpnames:submit` rather than `read`, and it refuses exactly
   * what the submit refuses — so a client that can preview can trust that
   * accepting will not then be turned away for a reason the preview did not
   * mention.
   */
  preview: (id: string) =>
    apiClient.post<OpnameSubmitPreview>(`/stock-opnames/${id}/preview`),

  /**
   * POST /stock-opnames/:id/submit — IRREVERSIBLE.
   *
   * Posts the differences to the stock ledger and the general ledger, and closes
   * the sheet. 200 rather than 201: it transitions a sheet that already exists.
   * The movements and journal entry it produces are read from their own
   * endpoints; `journalEntryId` on the response is how to get there, and is
   * legitimately null when the differences were worth nothing.
   */
  submit: (id: string) =>
    apiClient.post<Opname>(`/stock-opnames/${id}/submit`),

  /**
   * DELETE /stock-opnames/:id — soft delete, DRAFTS ONLY.
   *
   * 409 for a submitted sheet: it is the supporting document for movements and a
   * journal entry that are both immutable, and deleting it would leave the
   * ledger pointing at a reference nobody can look up.
   */
  remove: (id: string) => apiClient.delete<Opname>(`/stock-opnames/${id}`),
};
