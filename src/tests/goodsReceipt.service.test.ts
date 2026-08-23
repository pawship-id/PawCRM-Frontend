import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { apiClient } from "@/services/api-client";
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptListQuery,
} from "@/types/api";

/**
 * The goods-receipt module's HTTP contract: paths, verbs and query shapes.
 *
 * apiClient is spied on rather than fetch, so these assert what each service
 * ASKS FOR without a server — the same level supplier.service.test.ts works at.
 *
 * THE ABSENCES ARE ASSERTED TOO, and they are the point of this file. A receipt
 * is immutable: no `PATCH`, no `DELETE`, no `includeDeleted`. Those are backend
 * design decisions, and a frontend that quietly grew a method for one of them
 * would ship a button that 404s.
 */

/**
 * Every filter `GoodsReceiptListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` IS THE POINT. `list` spells its query out as an object literal,
 * one key at a time, and anything absent from that literal is dropped in
 * silence — which is how `sort` reached the catalogue and the supplier list
 * without ever reaching the wire, twice (see product.service.test.ts and
 * supplier.service.test.ts). A screen test cannot catch it because it mocks the
 * service.
 *
 * With this type, adding a field to `GoodsReceiptListQuery` breaks THIS OBJECT
 * at compile time until it is listed here, and then breaks the assertion below
 * until `list` actually sends it.
 */
const EVERY_FILTER: Required<GoodsReceiptListQuery> = {
  page: 2,
  limit: 20,
  search: "GR-2608",
  supplierId: "s1",
  warehouseId: "wh1",
  branchId: "br1",
  purchaseType: "konsinyasi",
  invoiced: false,
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  sort: "numberAsc",
};

describe("goodsReceiptService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/goods-receipts");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("sends the ordering the caller asked for", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({ sort: "numberDesc" });

    expect(get).toHaveBeenCalledWith(
      "/goods-receipts",
      expect.objectContaining({
        query: expect.objectContaining({ sort: "numberDesc" }),
      }),
    );
  });

  /**
   * The endpoint validates an `includeDeleted` flag, but there is no delete, so
   * it can never change a result. Sending it would advertise a state the data
   * cannot be in.
   */
  it("never sends includeDeleted, because receipts cannot be deleted", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({ search: "x" });

    const [, options] = get.mock.calls[0];
    expect(options?.query).not.toHaveProperty("includeDeleted");
  });

  it("reads one receipt by id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.getById("gr1");

    expect(get).toHaveBeenCalledWith("/goods-receipts/gr1");
  });

  it("posts a delivery to the collection root", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input: CreateGoodsReceiptInput = {
      supplierId: "s1",
      warehouseId: "wh1",
      purchaseType: "beli_putus",
      taxAmount: "16500",
      items: [{ productId: "p1", qty: "10", costPerUnit: "15000" }],
    };

    await goodsReceiptService.create(input);

    expect(post).toHaveBeenCalledWith("/goods-receipts", input);
  });

  /**
   * The preview must be the SAME REQUEST as the post, or a client that previews
   * cleanly can still be refused on save — for a reason the preview never
   * mentioned.
   */
  it("previews with the identical body it would create with", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input: CreateGoodsReceiptInput = {
      supplierId: "s1",
      warehouseId: "wh1",
      purchaseType: "beli_putus",
      items: [{ productId: "p1", qty: "10", costPerUnit: "15000" }],
    };

    await goodsReceiptService.preview(input);
    await goodsReceiptService.create(input);

    expect(post.mock.calls[0][0]).toBe("/goods-receipts/preview");
    expect(post.mock.calls[1][0]).toBe("/goods-receipts");
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  });

  it("summarises purchases for one supplier or for all", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.summary({ supplierId: "s1" });
    await goodsReceiptService.summary();

    expect(get).toHaveBeenNthCalledWith(1, "/goods-receipts/summary", {
      query: { supplierId: "s1" },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/goods-receipts/summary", {
      query: { supplierId: undefined },
    });
  });

  /**
   * A posted receipt is immutable. If somebody adds one of these, they have to
   * delete this test to do it — and that is a conversation, not an accident.
   */
  it("exposes no mutation beyond create", () => {
    expect(Object.keys(goodsReceiptService).sort()).toEqual([
      "create",
      "getById",
      "list",
      "preview",
      "summary",
    ]);
  });
});
