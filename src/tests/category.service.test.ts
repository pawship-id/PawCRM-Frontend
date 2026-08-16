import { categoryService } from "@/services/category.service";
import { apiClient } from "@/services/api-client";
import type { CategoryListQuery } from "@/types/api";

/**
 * The category HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason product.service.test.ts does, and it
 * caught two live bugs the day it was written. `list` spells its query out as an
 * object literal, and anything absent from that literal is dropped in silence:
 * `isActive` had been added to the type, to the hook and to the API, and the
 * request never carried it, so the Status filter on the category screen selected
 * nothing at all. A screen test that mocks the service cannot see that. This one
 * asserts one layer down.
 */

/**
 * Every filter `CategoryListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to `CategoryListQuery` breaks THIS
 * OBJECT at compile time until it is listed here, and then breaks the assertion
 * below until `list` actually sends it.
 */
const EVERY_FILTER: Required<CategoryListQuery> = {
  page: 2,
  limit: 20,
  kind: "product",
  search: "makanan",
  isActive: false,
  includeDeleted: true,
  sort: "nameAsc",
};

describe("categoryService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await categoryService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/categories");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("keeps isActive=false rather than treating it as unset", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await categoryService.list({ isActive: false });

    // "Show me the retired ones" is a filter, not an absent one — a truthiness
    // test anywhere on this path turns it into "show me everything".
    expect(get).toHaveBeenCalledWith(
      "/categories",
      expect.objectContaining({
        query: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it("defaults the page size to 100 — most callers want the whole list", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await categoryService.list();

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.limit).toBe(100);
    expect(options.query.isActive).toBeUndefined();
    expect(options.query.sort).toBeUndefined();
  });
});
