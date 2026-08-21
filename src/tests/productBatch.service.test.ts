import { productBatchService } from "@/services/productBatch.service";
import { apiClient } from "@/services/api-client";
import type {
  ExpiringBatchListQuery,
  ProductBatchListQuery,
} from "@/types/inventory";

/**
 * The batch HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason product.service.test.ts and
 * category.service.test.ts do, and they have caught three live bugs between
 * them. Each `list` spells its query out as an object literal, and anything
 * absent from that literal is dropped in silence: a field added to the type, to
 * the hook and to the API still never reaches the wire. A screen test that mocks
 * the service cannot see it. This one asserts one layer down.
 *
 * TWO ENDPOINTS HERE, and both take the ordering — the batches screen has one
 * sort control and flips between them as a search comes and goes, so a `sort`
 * forwarded on only one of them would look like a control that undoes itself.
 */

/**
 * Every filter each query type carries, with a value that is not `undefined` —
 * so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to either type breaks THESE OBJECTS
 * at compile time until it is listed, and then breaks the assertions until the
 * service actually sends it.
 */
const EVERY_LIST_FILTER: Required<ProductBatchListQuery> = {
  page: 2,
  limit: 20,
  productId: "p1",
  warehouseId: "w1",
  branchId: "b1",
  hasRemaining: true,
  search: "WSK-B26",
  expiryFrom: "2026-01-01",
  expiryTo: "2026-12-31",
  sort: "newest",
};

const EVERY_EXPIRING_FILTER: Required<ExpiringBatchListQuery> = {
  page: 2,
  limit: 20,
  warehouseId: "w1",
  branchId: "b1",
  withinDays: 7,
  sort: "expiryLatest",
};

/** Pulls the query object out of the single `apiClient.get` call. */
function sentQuery(get: jest.SpyInstance) {
  const [, options] = get.mock.calls[0] as [
    string,
    { query: Record<string, unknown> },
  ];
  return options.query;
}

describe("productBatchService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list forwards every filter it is given", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.list(EVERY_LIST_FILTER);

    expect(get.mock.calls[0][0]).toBe("/product-batches");
    for (const [key, value] of Object.entries(EVERY_LIST_FILTER)) {
      expect(sentQuery(get)[key]).toBe(value);
    }
  });

  it("expiring forwards every filter it is given, the ordering included", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.expiring(EVERY_EXPIRING_FILTER);

    expect(get.mock.calls[0][0]).toBe("/product-batches/expiring");
    for (const [key, value] of Object.entries(EVERY_EXPIRING_FILTER)) {
      expect(sentQuery(get)[key]).toBe(value);
    }
  });

  it("summary takes the same place filter as the list", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    // The tiles have no query type of their own to be `Required<…>`-checked, so
    // this is the one place a forgotten key would show — and a summary counting
    // a wider set than the rows under it is a total nobody can reconcile.
    await productBatchService.summary({ branchId: "b1", warehouseId: "w1" });

    expect(get.mock.calls[0][0]).toBe("/product-batches/summary");
    expect(sentQuery(get)).toMatchObject({ branchId: "b1", warehouseId: "w1" });
  });

  it("keeps hasRemaining=false rather than treating it as unset", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.list({ hasRemaining: false });

    // The hook sends `undefined` for "both" and `true` for "live only", so
    // `false` is not a case it produces — but a truthiness test anywhere on
    // this path would also swallow the `true`, and this is where it would show.
    expect(sentQuery(get).hasRemaining).toBe(false);
  });
});
