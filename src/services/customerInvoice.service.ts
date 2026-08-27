import { apiClient } from "./api-client";
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceListQuery,
  CustomerInvoiceListRow,
  CustomerOutstandingSummary,
  PageResult,
  RecordCustomerPaymentInput,
} from "@/types/api";

/**
 * Customer invoices (piutang pelanggan), against /api/customer-invoices.
 *
 * FOUR METHODS, AND THE ABSENCES ARE THE BACKEND'S DESIGN rather than this
 * file's caution:
 *
 *   NO `create`. Raising an invoice by hand cuts stock, posts two journal
 *   entries and allocates a number — that is PCR-030, and it lands with its own
 *   route. Every receivable in the system today was raised by the till: settling
 *   a sale with the Piutang method issues one automatically, inside the sale's
 *   own transaction. `source` tells the two apart.
 *
 *   NO `update`, NO `remove`, NO way to withdraw a payment. Every payment posts
 *   an immutable journal entry, so an edit would restate cash already reported
 *   and a delete would leave the ledger pointing at a document nobody can look
 *   up. A wrong payment is corrected by REVERSING its entry — see
 *   journalEntry.service — which leaves both the error and the correction
 *   visible.
 *
 * Mirrors purchaseInvoiceService, pointed the other way: each method maps one
 * typed domain operation onto a single apiClient request — no React, no state.
 * The tenant scope is derived from the session cookie by the backend, so it is
 * never passed here.
 */
export const customerInvoiceService = {
  /**
   * GET /customer-invoices — receivables, soonest due first, filterable.
   *
   * THE DEFAULT ORDER IS `dueSoonest`, and deliberately not the payable's
   * `newest`: a payables list is read to decide what to pay, a receivables list
   * to decide who to chase.
   *
   * `payments` IS PROJECTED AWAY by the server and replaced with `paymentCount`;
   * read one invoice to get them. `outstandingAmount` and `isOverdue` arrive
   * computed, against one instant for the whole page.
   *
   * THE AR FILTERS GO OVER THE WIRE. `outstanding`, `overdue` and `dueSoon` are
   * booleans the server understands — asking for everything and filtering here
   * would make the screen's list and the pager's total disagree the moment there
   * is a second page.
   */
  list: (query: CustomerInvoiceListQuery = {}) =>
    apiClient.get<PageResult<CustomerInvoiceListRow>>("/customer-invoices", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        customerId: query.customerId,
        branchId: query.branchId,
        status: query.status,
        source: query.source,
        outstanding: query.outstanding,
        overdue: query.overdue,
        dueSoon: query.dueSoon,
        horizonDays: query.horizonDays,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sort: query.sort,
      },
    }),

  /**
   * GET /customer-invoices/:id — one receivable, with its payments and labels.
   *
   * 404s for another tenant's invoice exactly as for an unknown id, which is the
   * intended answer: a 403 would confirm the id exists, and who owes a shop money
   * is among the most commercially sensitive material here.
   */
  getById: (id: string) =>
    apiClient.get<CustomerInvoiceDetail>(`/customer-invoices/${id}`),

  /**
   * GET /customer-invoices/outstanding — what is owed, per customer, how much of
   * it is already late, and how much falls due inside the window.
   *
   * SUMMED SERVER-SIDE over the whole book. The screen must not add up its own
   * rows: with two pages that total is a lower bound wearing a total's clothes.
   *
   * All three buckets are cut at one instant, so "already late" and "due this
   * week" cannot overlap and cannot leave a gap between them.
   */
  outstanding: (query: { customerId?: string; branchId?: string; horizonDays?: number } = {}) =>
    apiClient.get<CustomerOutstandingSummary>("/customer-invoices/outstanding", {
      query: {
        customerId: query.customerId,
        branchId: query.branchId,
        horizonDays: query.horizonDays,
      },
    }),

  /**
   * POST /customer-invoices/:id/payments — record money arriving (201). THE ONE
   * THAT MOVES MONEY.
   *
   * Posts `Dr <channel account> / Cr 1103 Piutang Usaha` in the same transaction
   * as the payment itself, and the entry is immutable.
   *
   * ONE CALL FOR DP, CICILAN AND PELUNASAN — there is no separate "settle" verb.
   * The status is derived from what has been paid, so a caller settling an
   * invoice sends `outstandingAmount`.
   *
   * NOT IDEMPOTENT, and callers must handle that themselves: a double-submitted
   * form records the money arriving twice on two irreversible entries.
   * RecordPaymentDialog locks its button for the whole flight.
   *
   * RETURNS THE UPDATED INVOICE, not the payment — what a screen needs afterwards
   * is the new balance and status. Overpayment is refused (400) and a concurrent
   * payment loses the compare-and-swap (409); both are worth showing verbatim.
   */
  recordPayment: (id: string, input: RecordCustomerPaymentInput) =>
    apiClient.post<CustomerInvoiceDetail>(
      `/customer-invoices/${id}/payments`,
      input,
    ),
};
