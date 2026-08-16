import { stockOpnameService } from "@/services/stockOpname.service";
import { apiClient } from "@/services/api-client";
import type { OpnameListQuery } from "@/types/inventory";

/**
 * The opname HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason product.service.test.ts,
 * category.service.test.ts and productBatch.service.test.ts do; between them
 * they have caught three live bugs. `list` spells its query out as an object
 * literal, and anything absent from that literal is dropped in silence: a field
 * added to the type, to the hook and to the API still never reaches the wire,
 * and a screen test that mocks the service cannot see it.
 */

/**
 * Every filter `OpnameListQuery` carries, with a value that is not `undefined`
 * — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to the type breaks THIS OBJECT at
 * compile time until it is listed here, and then breaks the assertion below
 * until `list` actually sends it.
 */
const EVERY_FILTER: Required<OpnameListQuery> = {
  page: 2,
  limit: 20,
  search: "OPN-2026",
  warehouseId: "w1",
  status: "draft",
  categoryFilter: "c1",
  dateFrom: "2026-08-01T00:00:00.000Z",
  dateTo: "2026-08-31T23:59:59.999Z",
  includeDeleted: true,
  sort: "numberAsc",
};

describe("stockOpnameService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockOpnameService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/stock-opnames");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("leaves an unset filter out rather than sending it empty", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockOpnameService.list({ status: "submitted" });

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.status).toBe("submitted");
    expect(options.query.sort).toBeUndefined();
    expect(options.query.warehouseId).toBeUndefined();
  });
});
