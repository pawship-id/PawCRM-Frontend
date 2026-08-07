import { apiClient } from "./api-client";
import type { SupplierOutstandingSummary } from "@/types/api";

/**
 * Purchase invoices (payables), against /api/purchase-invoices.
 *
 * ONE METHOD SO FAR, deliberately. The payables screen still runs on the
 * prototype store, and this module exists for the supplier screens' sake: "what
 * do we still owe this vendor" is the column that turns a supplier list from an
 * address book into the screen somebody opens before deciding who to pay this
 * week. The rest of the payables API gets wrapped when that screen is converted.
 */
export const purchaseInvoiceService = {
  /**
   * GET /purchase-invoices/outstanding — what is owed, per supplier.
   *
   * SUMMED SERVER-SIDE OVER THE WHOLE BOOK, not over a page of invoices. A client
   * adding up the twenty rows it was sent would report a figure that grows as the
   * user pages — worse than showing nothing, because it looks like a total.
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
