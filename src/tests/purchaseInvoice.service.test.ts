import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { apiClient } from "@/services/api-client";
import type { PurchaseInvoiceListQuery } from "@/types/api";

/**
 * The purchase-invoice module's HTTP contract: paths, verbs and query shapes.
 *
 * apiClient is spied on rather than fetch, so these assert what the service ASKS
 * FOR without a server — the same level goodsReceipt.service.test.ts works at.
 *
 * THE ABSENCES ARE ASSERTED TOO, and they are half the point of this file. An
 * invoice is immutable and a payment cannot be withdrawn: no `PATCH`, no
 * `DELETE`, no `includeDeleted`. Those are backend design decisions — every
 * payment posts a journal entry that cannot be edited — and a frontend that
 * quietly grew a method for one of them would ship a button that 404s.
 */

/**
 * Every filter `PurchaseInvoiceListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` IS THE POINT. `list` spells its query out as an object literal,
 * one key at a time, and anything absent from that literal is dropped in
 * silence — which is how `sort` reached the catalogue and the supplier list
 * without ever reaching the wire (see product.service.test.ts and
 * supplier.service.test.ts). A screen test cannot catch it because it mocks the
 * service.
 *
 * `status` sits alongside the three AP shorthands here even though the API takes
 * the status and drops them: this asserts what is SENT, and the server's
 * precedence rule is its own test's business.
 */
const EVERY_FILTER: Required<PurchaseInvoiceListQuery> = {
  page: 2,
  limit: 20,
  search: "INV/2026",
  supplierId: "s1",
  branchId: "b1",
  warehouseId: "wh1",
  goodsReceiptId: "gr1",
  status: "partial",
  outstanding: true,
  overdue: true,
  dueSoon: true,
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  dueBefore: "2026-09-01T00:00:00.000Z",
  sort: "dueSoonest",
};

describe("purchaseInvoiceService", () => {
  afterEach(() => jest.restoreAllMocks());

  describe("list", () => {
    it("forwards every filter it is given — nothing is dropped on the way out", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseInvoiceService.list(EVERY_FILTER);

      const [path, options] = get.mock.calls[0] as [
        string,
        { query: Record<string, unknown> },
      ];
      expect(path).toBe("/purchase-invoices");

      for (const [key, value] of Object.entries(EVERY_FILTER)) {
        expect(options.query[key]).toBe(value);
      }
    });

    /**
     * `dueSoonest` orders by `dueDate` while `newest` orders by `invoiceDate` —
     * the ordering names an AXIS as well as a direction here, because the row
     * carries both dates.
     */
    it("sends the ordering the caller asked for", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseInvoiceService.list({ sort: "dueLatest" });

      expect(get).toHaveBeenCalledWith(
        "/purchase-invoices",
        expect.objectContaining({
          query: expect.objectContaining({ sort: "dueLatest" }),
        }),
      );
    });

    /**
     * THE AP REPORT GOES OVER THE WIRE. Outstanding is `status != paid` and
     * overdue is that plus a due date already past — both are the server's
     * definitions, so every consumer asks the question the same way. Filtering a
     * page here instead would show four rows above a pager claiming twenty.
     */
    it("sends the AP shorthands as booleans", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseInvoiceService.list({ outstanding: true, overdue: true });

      const [, options] = get.mock.calls[0];
      expect(options?.query).toMatchObject({
        outstanding: true,
        overdue: true,
      });
    });

    /**
     * The endpoint validates an `includeDeleted` flag, but nothing writes
     * `deletedAt` and no route removes an invoice, so it can never change a
     * result. Sending it would advertise a state the data cannot be in.
     */
    it("never sends includeDeleted", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseInvoiceService.list({ search: "x" });

      const [, options] = get.mock.calls[0];
      expect(options?.query).not.toHaveProperty("includeDeleted");
    });
  });

  it("reads one invoice by id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await purchaseInvoiceService.getById("inv1");

    expect(get).toHaveBeenCalledWith("/purchase-invoices/inv1");
  });

  it("posts a new invoice to the collection root", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    const input = {
      supplierId: "s1",
      goodsReceiptId: "gr1",
      invoiceNumber: "INV/2026/VIII/0142",
      invoiceDate: "2026-08-06",
      subtotal: "150000.0000",
      taxAmount: "16500.0000",
    };

    await purchaseInvoiceService.create(input);

    // The body is forwarded verbatim: `dueDate`, `total`, `status` and
    // `branchId` are all derived server-side and must not appear.
    expect(post).toHaveBeenCalledWith("/purchase-invoices", input);
  });

  it("posts a payment to the invoice's own sub-resource", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    await purchaseInvoiceService.recordPayment("inv1", {
      amount: "66500",
      method: "transfer",
      // Required since UT-1: which account the money leaves from.
      channelId: "chan1",
      at: "2026-08-20",
      ref: "TRF/998877",
    });

    expect(post).toHaveBeenCalledWith("/purchase-invoices/inv1/payments", {
      amount: "66500",
      method: "transfer",
      channelId: "chan1",
      at: "2026-08-20",
      ref: "TRF/998877",
    });
  });

  it("asks for the outstanding summary, optionally per supplier", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await purchaseInvoiceService.outstandingSummary({ supplierId: "s1" });

    expect(get).toHaveBeenCalledWith("/purchase-invoices/outstanding", {
      query: { supplierId: "s1" },
    });
  });

  /**
   * An invoice is written once and read forever; a payment appends and can never
   * be rewritten. There is no PATCH and no DELETE on the backend, so a method for
   * either here would be a button that 404s — and, worse, an implied promise that
   * a posted payment can be taken back.
   */
  it("exposes no update or delete", () => {
    expect(purchaseInvoiceService).not.toHaveProperty("update");
    expect(purchaseInvoiceService).not.toHaveProperty("remove");
    expect(purchaseInvoiceService).not.toHaveProperty("delete");
    expect(purchaseInvoiceService).not.toHaveProperty("removePayment");
  });
});

/**
 * The receipt-side half of the payables flow.
 *
 * `invoiced` had no server filter until this feature added one, and the picker
 * that needs it cannot be correct without: the API pages before a client could
 * filter, so a page-local `invoiceId === null` hides deliveries the pager has
 * already counted.
 */
describe("goodsReceiptService.list — the invoiced filter", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards invoiced=false", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({ invoiced: false });

    const [, options] = get.mock.calls[0];
    // FALSE, not omitted — `undefined` would drop it in the query builder and
    // silently return every delivery, billed or not.
    expect(options?.query?.invoiced).toBe(false);
  });

  it("leaves it out when the caller does not care", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({});

    const [, options] = get.mock.calls[0];
    expect(options?.query?.invoiced).toBeUndefined();
  });
});
