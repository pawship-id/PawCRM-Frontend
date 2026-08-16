import { supplierService } from "@/services/supplier.service";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { productBatchService } from "@/services/productBatch.service";
import { apiClient } from "@/services/api-client";
import type { SupplierListQuery } from "@/types/api";

/**
 * The supplier module's HTTP contract: paths, verbs and query shapes.
 *
 * apiClient is spied on rather than fetch, so these assert what each service
 * ASKS FOR without a server — the same level branch.service.test.ts works at.
 */

/**
 * Every filter `SupplierListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` IS THE POINT, and it is here because the thing it guards against
 * has now happened twice: `list` spells its query out as an object literal, one
 * key at a time, and anything absent from that literal is dropped in silence.
 * `sort` was added to the query type, to the hook and to the toolbar, and the
 * request went out without it — the picker moved and the list did not, exactly
 * as it had on the catalogue (see product.service.test.ts). A screen test cannot
 * catch it because it mocks the service.
 *
 * With this type, adding a field to `SupplierListQuery` breaks THIS OBJECT at
 * compile time until it is listed here, and then breaks the assertion below
 * until `list` actually sends it.
 */
const EVERY_FILTER: Required<SupplierListQuery> = {
  page: 2,
  limit: 20,
  type: "konsinyasi",
  search: "sumber",
  isActive: true,
  includeDeleted: false,
  sort: "nameAsc",
};

describe("supplierService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/suppliers");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("sends the ordering the caller asked for", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierService.list({ sort: "nameDesc" });

    expect(get).toHaveBeenCalledWith(
      "/suppliers",
      expect.objectContaining({
        query: expect.objectContaining({ sort: "nameDesc" }),
      }),
    );
  });

  /**
   * `isActive` MUST SURVIVE AS `false`, and this is the trap: a service that
   * built its query with `||` or a truthiness check would drop it, and "show me
   * the deactivated vendors" would silently return every vendor instead.
   */
  it("keeps isActive=false rather than dropping it as falsy", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierService.list({ isActive: false });

    expect(get).toHaveBeenCalledWith("/suppliers", {
      query: expect.objectContaining({ isActive: false }),
    });
  });

  it("omits an unset isActive so the API returns both states", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierService.list({ search: "x" });

    const [, options] = get.mock.calls[0];
    expect(options?.query?.isActive).toBeUndefined();
  });

  it("reads one supplier by id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierService.getById("s1");

    expect(get).toHaveBeenCalledWith("/suppliers/s1");
  });

  it("creates with POST", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input = { name: "PT Sumber", type: "beli_putus" as const };

    await supplierService.create(input);

    expect(post).toHaveBeenCalledWith("/suppliers", input);
  });

  it("updates with PATCH, sending only the patch it was given", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await supplierService.update("s1", { paymentTermDays: 45 });

    expect(patch).toHaveBeenCalledWith("/suppliers/s1", {
      paymentTermDays: 45,
    });
  });

  /**
   * Deactivating rides on the ordinary update — there is no `/deactivate`
   * endpoint, and adding one here would invent an API the server does not have.
   */
  it("deactivates through the same PATCH", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await supplierService.update("s1", { isActive: false });

    expect(patch).toHaveBeenCalledWith("/suppliers/s1", { isActive: false });
  });

  it("deletes and restores through their own routes", async () => {
    const del = jest.spyOn(apiClient, "delete").mockResolvedValue({} as never);
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await supplierService.remove("s1");
    await supplierService.restore("s1");

    expect(del).toHaveBeenCalledWith("/suppliers/s1");
    expect(patch).toHaveBeenCalledWith("/suppliers/s1/restore");
  });
});

/**
 * The three summaries the supplier screens read. Each is one request for EVERY
 * supplier, which is what keeps a twenty-row page from costing sixty round
 * trips — see useSupplierSummaries.
 */
describe("supplier summaries", () => {
  afterEach(() => jest.restoreAllMocks());

  it("asks for outstanding payables per supplier", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await purchaseInvoiceService.outstandingSummary();

    expect(get).toHaveBeenCalledWith("/purchase-invoices/outstanding", {
      query: { supplierId: undefined },
    });
  });

  it("asks for purchase history per supplier", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.summary({ supplierId: "s1" });

    expect(get).toHaveBeenCalledWith("/goods-receipts/summary", {
      query: { supplierId: "s1" },
    });
  });

  it("asks for consigned stock per supplier", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.consignmentSummary({ supplierId: "s1" });

    expect(get).toHaveBeenCalledWith("/product-batches/consignment-summary", {
      query: { supplierId: "s1" },
    });
  });

  it("lists one supplier's receipts for the history panel", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({ supplierId: "s1", limit: 10, page: 1 });

    expect(get).toHaveBeenCalledWith("/goods-receipts", {
      query: expect.objectContaining({ supplierId: "s1", limit: 10, page: 1 }),
    });
  });
});
