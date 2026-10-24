import { productService } from "@/services/product.service";
import { apiClient } from "@/services/api-client";
import type { ProductListQuery } from "@/types/inventory";

/**
 * The catalogue's HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS. `list` spells its query out as an object literal, one
 * key at a time, and anything absent from that literal is dropped in silence —
 * which is exactly what happened to `sort` when ordering was added: the hook
 * put it in the query, ProductsScreen asserted `productService.list` had been
 * called with it, and the test passed because it mocks the service. The request
 * went out without it and the list stayed in creation order.
 *
 * A screen test that mocks the service can never catch that. This one asserts
 * one layer down, against `apiClient`.
 */

/**
 * Every filter `ProductListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<Omit<…>>` is the point: adding a field to `ProductListQuery` breaks
 * THIS OBJECT at compile time until it is listed here, and then breaks the
 * assertion below until `list` actually sends it. The three type selectors are
 * omitted because the API rejects any pair of them with a 400 — `productType`
 * stands in for the group and the other two are covered on their own.
 */
const EVERY_FILTER: Required<
  Omit<ProductListQuery, "excludeVariants" | "holdsStock">
> = {
  page: 2,
  limit: 20,
  search: "royal canin",
  categoryId: "c1",
  uncategorized: true,
  productType: "standalone",
  parentId: "p1",
  isActive: true,
  isConsignment: true,
  neverMovedInWarehouse: "wh1",
  inStockAtWarehouse: "wh2",
  searchBatches: true,
  includeDeleted: true,
  view: "picker",
  sort: "nameAsc",
  stockWarehouseId: "wh3",
  stockWarehouseIds: ["wh4", "wh5"],
};

describe("productService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/products");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("sends isConsignment: false, which is a filter and not an absence", async () => {
    // The one filter on this list whose FALSE is meaningful. Every sibling is
    // forwarded through `x || undefined` somewhere up the stack, and doing that
    // to this one turns the receipt form's *Beli putus* picker back into the
    // whole catalogue — silently, since an unfiltered list looks like a working
    // one.
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productService.list({ isConsignment: false });

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.isConsignment).toBe(false);
  });

  it("sends the ordering the caller asked for", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productService.list({ sort: "skuAsc" });

    expect(get).toHaveBeenCalledWith(
      "/products",
      expect.objectContaining({
        query: expect.objectContaining({ sort: "skuAsc" }),
      }),
    );
  });

  it("sends the low-stock and negative-stock orderings", async () => {
    // Both lists are paged, so their header sorts only mean anything if the
    // NAME reaches the server — a dropped key would leave the default order
    // under a header that claims otherwise.
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productService.lowStock({ page: 1, sort: "shortageDesc" });
    await productService.negativeStock({ page: 1, sort: "warehouseAsc" });

    expect(get).toHaveBeenNthCalledWith(
      1,
      "/products/low-stock",
      expect.objectContaining({
        query: expect.objectContaining({ sort: "shortageDesc" }),
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/products/negative-stock",
      expect.objectContaining({
        query: expect.objectContaining({ sort: "warehouseAsc" }),
      }),
    );
  });

  it("leaves an unset filter out rather than sending it empty", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productService.list({ excludeVariants: true });

    // apiClient drops the undefined entries, so the catalogue's own request
    // carries `excludeVariants` and nothing else it did not ask for.
    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.excludeVariants).toBe(true);
    expect(options.query.categoryId).toBeUndefined();
    expect(options.query.sort).toBeUndefined();
  });
});
