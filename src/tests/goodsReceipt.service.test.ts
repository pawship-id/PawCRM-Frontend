import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { apiClient } from "@/services/api-client";
import type { CreateGoodsReceiptInput } from "@/types/api";

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
describe("goodsReceiptService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists with every supported filter forwarded", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await goodsReceiptService.list({
      page: 2,
      limit: 20,
      search: "GR-2608",
      supplierId: "s1",
      warehouseId: "wh1",
      purchaseType: "konsinyasi",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });

    expect(get).toHaveBeenCalledWith("/goods-receipts", {
      query: {
        page: 2,
        limit: 20,
        search: "GR-2608",
        supplierId: "s1",
        warehouseId: "wh1",
        purchaseType: "konsinyasi",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
      },
    });
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

describe("purchaseReturnService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("finds the returns raised against one delivery", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await purchaseReturnService.list({
      originalReceiptId: "gr1",
      limit: 50,
    });

    expect(get).toHaveBeenCalledWith("/purchase-returns", {
      query: expect.objectContaining({
        originalReceiptId: "gr1",
        limit: 50,
      }),
    });
  });

  /**
   * Read-only on purpose: the returns SCREENS still run on the prototype store,
   * and wrapping the writes before they are converted would put two ways to
   * return goods in the codebase at once.
   */
  it("wraps no write, because the returns screens are not converted yet", () => {
    expect(Object.keys(purchaseReturnService)).toEqual(["list"]);
  });
});
