import { apiClient } from "./api-client";
import type {
  CreatePurchaseInvoiceInput,
  PageResult,
  PurchaseInvoiceDetail,
  PurchaseInvoiceListQuery,
  PurchaseInvoiceListRow,
  RecordPaymentInput,
  SupplierOutstandingSummary,
} from "@/types/api";

/**
 * Purchase invoices (utang supplier), against /api/purchase-invoices.
 *
 * FIVE METHODS, AND THE ABSENCES ARE THE BACKEND'S DESIGN rather than this
 * file's caution. There is no `update` and no `remove` because there is no
 * `PATCH` and no `DELETE` there, and no way to withdraw a payment either: every
 * payment posts an immutable journal entry, so an edit would restate cash that
 * has already been reported and a delete would leave the ledger pointing at a
 * document nobody can look up. A wrong payment is corrected by REVERSING its
 * entry — see journalEntry.service — which leaves both the error and the
 * correction visible.
 *
 * WHAT `create` DOES NOT DO IS CREATE THE DEBT. A `beli_putus` goods receipt
 * credits `2101 Utang Supplier` the moment it posts, so filing an invoice writes
 * no journal entry at all. What it adds is the vendor's own number, the issue
 * date, and the due date derived from their payment terms. A screen that reads a
 * receipt's null `invoiceId` as "nothing is owed" is wrong.
 *
 * Mirrors goodsReceiptService: each method maps one typed domain operation onto
 * a single apiClient request — no React, no state. The tenant scope is derived
 * from the session cookie by the backend, so it is never passed here.
 */
export const purchaseInvoiceService = {
  /**
   * GET /purchase-invoices — bills, newest issue date first, filterable.
   *
   * `payments` IS PROJECTED AWAY by the server and replaced with `paymentCount`;
   * read one invoice to get them. `outstandingAmount` and `isOverdue` arrive
   * computed, against one instant for the whole page.
   *
   * THE AP FILTERS GO OVER THE WIRE. `outstanding`, `overdue` and `dueSoon` are
   * booleans the server understands — asking for everything and filtering here
   * would make the screen's list and the pager's total disagree the moment there
   * is a second page, which is the failure mode that looks like working software.
   */
  list: (query: PurchaseInvoiceListQuery = {}) =>
    apiClient.get<PageResult<PurchaseInvoiceListRow>>("/purchase-invoices", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        supplierId: query.supplierId,
        branchId: query.branchId,
        warehouseId: query.warehouseId,
        goodsReceiptId: query.goodsReceiptId,
        status: query.status,
        outstanding: query.outstanding,
        overdue: query.overdue,
        dueSoon: query.dueSoon,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        dueBefore: query.dueBefore,
        sort: query.sort,
      },
    }),

  /**
   * GET /purchase-invoices/:id — one bill, with its payments and their labels.
   *
   * 404s for another tenant's invoice exactly as for an unknown id, which is the
   * intended answer: a 403 would confirm the id exists, and what a tenant owes
   * and to whom is among the most commercially sensitive material here.
   */
  getById: (id: string) =>
    apiClient.get<PurchaseInvoiceDetail>(`/purchase-invoices/${id}`),

  /**
   * POST /purchase-invoices — file the supplier's bill against a delivery (201).
   *
   * REFUSED IF THE AMOUNTS DO NOT RECONCILE with the goods receipt, to the minor
   * unit, and the 400 quotes both figures. That is why callers prefill from the
   * receipt rather than asking a human to retype: the payable is already on the
   * books at the receipt's numbers, so a difference would be a price variance
   * nothing posted.
   *
   * Also refused for a delivery already billed (409) and for a `konsinyasi` one
   * (400) — consignment goods stay the supplier's until they sell, so nothing is
   * owed on arrival.
   */
  create: (input: CreatePurchaseInvoiceInput) =>
    apiClient.post<PurchaseInvoiceDetail>("/purchase-invoices", input),

  /**
   * POST /purchase-invoices/:id/payments — pay a supplier (201). THE ONE THAT
   * MOVES MONEY.
   *
   * Posts `Dr 2101 Utang Supplier / Cr 1101 Kas or 1102 Bank` in the same
   * transaction as the payment itself, and the entry is immutable.
   *
   * NOT IDEMPOTENT, and callers must handle that themselves: there is no
   * idempotency key, so a double-submitted form records the cash leaving twice
   * on two irreversible entries. RecordPaymentForm locks its button for the whole
   * flight.
   *
   * RETURNS THE UPDATED INVOICE, not the payment — what a screen needs after
   * paying is the new balance and status, and returning the payment alone would
   * make it fetch the invoice again to learn either. Overpayment is refused (400)
   * and a concurrent payment loses the compare-and-swap (409); both are worth
   * showing verbatim, because both tell the user what to do next.
   */
  recordPayment: (id: string, input: RecordPaymentInput) =>
    apiClient.post<PurchaseInvoiceDetail>(
      `/purchase-invoices/${id}/payments`,
      input,
    ),

  /**
   * GET /purchase-invoices/outstanding — what is owed, per supplier, and how
   * much of it is already late.
   *
   * SUMMED SERVER-SIDE OVER THE WHOLE BOOK, not over a page of invoices. A client
   * adding up the twenty rows it was sent would report a figure that grows as the
   * user pages — worse than showing nothing, because it looks like a total.
   *
   * THE OVERDUE FIGURES COME FROM HERE rather than from counting `?overdue=true`:
   * that filter answers with a count and nothing else, so the rupiah amount would
   * otherwise mean paging the entire overdue book. Both halves are computed in
   * one aggregation as of one instant, so the total and the late subset cannot
   * disagree.
   *
   * A supplier who owes nothing is absent from `items`, not present with zeros;
   * callers key by `supplierId` and read a miss as zero.
   */
  outstandingSummary: (query: { supplierId?: string } = {}) =>
    apiClient.get<SupplierOutstandingSummary>(
      "/purchase-invoices/outstanding",
      { query: { supplierId: query.supplierId } },
    ),
};
