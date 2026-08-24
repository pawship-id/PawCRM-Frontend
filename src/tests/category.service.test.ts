import { categoryService } from "@/services/category.service";
import { apiClient } from "@/services/api-client";
import type { CategoryListQuery } from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

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
  parentId: "5a7f1f77bcf86cd799439077",
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

  it("passes a create body through whole, image token included", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const image: MediaAsset = {
      mediaType: "image",
      url: "http://localhost:5000/media/t1/category/2026/08/a.webp",
      storageKey: "t1/category/2026/08/a.webp",
      driver: "local",
      mimeType: "image/webp",
      token: "signed",
    };

    await categoryService.create({
      name: "Makanan",
      description: "Basah dan kering",
      image,
    });

    // `token` is what makes "this was uploaded through our endpoint" checkable
    // at all — the API refuses an asset without one, so a service that quietly
    // reshaped the object would break every upload.
    expect(post).toHaveBeenCalledWith("/categories", {
      name: "Makanan",
      description: "Basah dan kering",
      image,
    });
  });

  it("passes a null image through as the remove instruction it is", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

    await categoryService.update("c1", { image: null });

    expect(patch).toHaveBeenCalledWith("/categories/c1", { image: null });
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
