import { apiClient } from "./api-client";
import type {
  CancelCashTransactionInput,
  CashTransaction,
  CashTransactionChannelSummary,
  CashTransactionListQuery,
  CashTransactionListResponse,
  CreateCashTransactionInput,
  UpdateCashTransactionInput,
} from "@/types/api";

/**
 * Transaksi Keuangan — every numbered movement of money, against
 * /api/cash-transactions.
 *
 * A SOURCE DOCUMENT, NOT A SECOND LEDGER. Each transaction posts one journal
 * entry; the reports still read the journal. That is why there is no delete:
 * `update` reverses the standing entry and posts a new one under the SAME
 * number, and `cancel` reverses it and marks the row — both the mistake and
 * its correction stay visible.
 *
 * One typed operation per apiClient request, no React, mirroring
 * journalEntry.service.ts. The tenant comes from the session cookie.
 */

/** The API's hard page-size cap (`LIST_MAX_LIMIT` in the model). */
const MAX_PAGE_LIMIT = 100;

export const cashTransactionService = {
  /**
   * GET /cash-transactions — one page, plus `totals` (posted only) over the
   * WHOLE filter, so the two summary cards never sum just the page.
   *
   * `kind` goes out COMMA-JOINED, not as repeated params: that is the one shape
   * the validator accepts (`customer_payment,expense`), and apiClient would
   * otherwise repeat an array.
   */
  list: (query: CashTransactionListQuery = {}) =>
    apiClient.get<CashTransactionListResponse>("/cash-transactions", {
      query: {
        page: query.page,
        limit: query.limit
          ? Math.min(query.limit, MAX_PAGE_LIMIT)
          : undefined,
        sort: query.sort,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        direction: query.direction,
        kind: Array.isArray(query.kind)
          ? query.kind.length > 0
            ? query.kind.join(",")
            : undefined
          : query.kind,
        branchId: query.branchId,
        channelId: query.channelId,
        status: query.status,
        partyId: query.partyId,
        documentType: query.documentType,
        documentId: query.documentId,
        recordedVia: query.recordedVia,
        shiftId: query.shiftId,
        search: query.search,
      },
    }),

  /**
   * GET /cash-transactions/summary — Σ in and Σ out PER CHANNEL, over the whole
   * filter rather than the page.
   *
   * WHY NOT ONE `channelId` REQUEST PER ROW, which is what the Kas & Bank table
   * would otherwise do: that is a fan-out that grows with the tenant's own list
   * of channels — six channels is six scans of the same period to draw one
   * table, re-run on every filter change.
   *
   * Takes the list's filters minus its pagination and sort. A channel with no
   * movement is ABSENT; key by `channelId` and read a miss as zero.
   */
  summaryByChannel: (
    query: Omit<CashTransactionListQuery, "page" | "limit" | "sort"> = {},
  ) =>
    apiClient.get<CashTransactionChannelSummary>(
      "/cash-transactions/summary",
      {
        query: {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          direction: query.direction,
          kind: Array.isArray(query.kind)
            ? query.kind.length > 0
              ? query.kind.join(",")
              : undefined
            : query.kind,
          branchId: query.branchId,
          channelId: query.channelId,
          status: query.status,
          partyId: query.partyId,
          documentType: query.documentType,
          documentId: query.documentId,
          recordedVia: query.recordedVia,
          shiftId: query.shiftId,
          search: query.search,
        },
      },
    ),

  /** GET /cash-transactions/:id — one transaction with its revisions. */
  getById: (id: string) =>
    apiClient.get<CashTransaction>(`/cash-transactions/${id}`),

  /**
   * POST /cash-transactions — an expense or other income (201).
   *
   * The server checks what the shape cannot: expense lines on active `expense`
   * accounts, income lines on `income` accounts, a channel usable in that
   * direction and belonging to the branch, and a date not in the future. Those
   * come back as 400s worth showing verbatim.
   */
  create: (input: CreateCashTransactionInput) =>
    apiClient.post<CashTransaction>("/cash-transactions", input),

  /**
   * PATCH /cash-transactions/:id — change it. THE NUMBER STAYS.
   *
   * Refused (400) when the new channel crosses kas ↔ bank — the prefix of a
   * number that does not change would lie — and on a cancelled, legacy or
   * pos_refund transaction. Send only what changed.
   */
  update: (id: string, patch: UpdateCashTransactionInput) =>
    apiClient.patch<CashTransaction>(`/cash-transactions/${id}`, patch),

  /**
   * POST /cash-transactions/:id/void — cancel it, with the reason that will be
   * the only record of why. The route says `void`; every screen says "batal".
   */
  cancel: (id: string, input: CancelCashTransactionInput) =>
    apiClient.post<CashTransaction>(`/cash-transactions/${id}/void`, input),
};
