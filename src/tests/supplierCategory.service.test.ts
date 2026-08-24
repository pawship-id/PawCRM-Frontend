import { supplierCategoryService } from "@/services/supplierCategory.service";
import { apiClient } from "@/services/api-client";
import type { SupplierCategoryListQuery } from "@/types/api";

/**
 * The supplier-category HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason category.service.test.ts does, and the
 * bug it guards against is one that file caught for real: `list` spells its
 * query out as an object literal, and anything absent from that literal is
 * dropped in silence. A filter added to the type, the hook and the API, but not
 * to the literal, is a control on screen that selects nothing — and a screen
 * test that mocks the service cannot see it.
 */

/**
 * Every filter `SupplierCategoryListQuery` carries, each with a value that is
 * not `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to the query type breaks THIS
 * OBJECT at compile time until it is listed here, and then breaks the assertion
 * below until `list` actually sends it.
 */
const EVERY_FILTER: Required<SupplierCategoryListQuery> = {
  page: 2,
  limit: 20,
  search: "distributor",
  isActive: false,
  includeDeleted: true,
  sort: "nameAsc",
};

describe("supplierCategoryService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierCategoryService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/supplier-categories");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("keeps isActive=false rather than treating it as unset", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierCategoryService.list({ isActive: false });

    // "Show me the retired ones" is a filter, not an absent one — a truthiness
    // test anywhere on this path turns it into "show me everything".
    expect(get).toHaveBeenCalledWith(
      "/supplier-categories",
      expect.objectContaining({
        query: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it("sends no kind on create — the API stamps it and refuses one from a client", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    await supplierCategoryService.create({ name: "Distributor" });

    expect(post).toHaveBeenCalledWith("/supplier-categories", {
      name: "Distributor",
    });
  });

  it("patches only what it is handed, so an untouched field is never resent", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await supplierCategoryService.update("c1", { isActive: false });

    // Resending the name on a retire would put it through the server's 409 name
    // check against itself.
    expect(patch).toHaveBeenCalledWith("/supplier-categories/c1", {
      isActive: false,
    });
  });

  it("hits the restore sub-route rather than patching deletedAt", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await supplierCategoryService.restore("c1");

    expect(patch).toHaveBeenCalledWith("/supplier-categories/c1/restore");
  });

  it("defaults the page size to 100 — most callers want the whole list", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await supplierCategoryService.list();

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.limit).toBe(100);
    expect(options.query.isActive).toBeUndefined();
    expect(options.query.sort).toBeUndefined();
  });
});
