import { stockMovementService } from "@/services/stockMovement.service";
import { productBatchService } from "@/services/productBatch.service";
import { apiClient } from "@/services/api-client";

/**
 * The two read services behind the stock card.
 *
 * Asserts the full query object rather than a subset: apiClient drops undefined
 * entries when it builds the URL, so an unset filter that quietly became `null`
 * or `""` would be SENT, and a stock card silently filtered to nothing is very
 * hard to attribute back to here.
 */
describe("stockMovementService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /stock-movements with every filter it was given", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockMovementService.list({
      page: 2,
      limit: 50,
      productId: "p1",
      warehouseId: "wh1",
      movementType: "pos_sale",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-03T23:59:59.999Z",
    });

    expect(get).toHaveBeenCalledWith("/stock-movements", {
      query: {
        page: 2,
        limit: 50,
        productId: "p1",
        warehouseId: "wh1",
        batchId: undefined,
        movementType: "pos_sale",
        referenceType: undefined,
        referenceId: undefined,
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-03T23:59:59.999Z",
      },
    });
  });

  it("list sends no filters at all when given none", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockMovementService.list();

    expect(get).toHaveBeenCalledWith("/stock-movements", {
      query: {
        page: undefined,
        limit: undefined,
        productId: undefined,
        warehouseId: undefined,
        batchId: undefined,
        movementType: undefined,
        referenceType: undefined,
        referenceId: undefined,
        from: undefined,
        to: undefined,
      },
    });
  });

  it("getById gets /stock-movements/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockMovementService.getById("m1");

    expect(get).toHaveBeenCalledWith("/stock-movements/m1");
  });

  it("exposes exactly one write — the ledger is append-only", () => {
    // `create` posts an adjustment or a transfer, which is the whole write
    // surface the API offers a client. An `update` or a `remove` appearing here
    // later is a design change, not a convenience: a wrong movement is corrected
    // by posting a reversing one, which `create` already covers. `preview` is a
    // POST that writes nothing.
    expect(Object.keys(stockMovementService).sort()).toEqual([
      "create",
      "export",
      "getById",
      "list",
      "preview",
      "summary",
    ]);
  });

  it("preview posts the same payload as create, and cannot carry a retry token", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    await stockMovementService.preview({
      operation: "adjustment",
      productId: "p1",
      warehouseId: "wh1",
      qty: "-3",
    });

    expect(post).toHaveBeenCalledWith("/stock-movements/preview", {
      operation: "adjustment",
      productId: "p1",
      warehouseId: "wh1",
      qty: "-3",
    });
    // There is nothing to be idempotent about when nothing is written, and the
    // API refuses the field — reusing a key on the create afterwards would look
    // like a replay of a request that never happened.
    expect(post.mock.calls[0][1]).not.toHaveProperty("idempotencyKey");
  });

  it("create posts the operation and hands back every row the server wrote", async () => {
    const post = jest
      .spyOn(apiClient, "post")
      .mockResolvedValue([{ _id: "m1" }, { _id: "m2" }] as never);

    const written = await stockMovementService.create({
      operation: "transfer",
      fromWarehouseId: "wh1",
      toWarehouseId: "wh2",
      items: [{ productId: "p1", qty: "6" }],
    });

    expect(post).toHaveBeenCalledWith("/stock-movements", {
      operation: "transfer",
      fromWarehouseId: "wh1",
      toWarehouseId: "wh2",
      items: [{ productId: "p1", qty: "6" }],
    });
    // An ARRAY, always: FEFO splits a withdrawal across lots and a transfer
    // writes a pair per lot. A caller assuming one object would drop the rest.
    expect(written).toHaveLength(2);
  });

  it("summary gets /stock-movements/summary with the filters and no paging", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await stockMovementService.summary({
      productId: "p1",
      warehouseId: "wh1",
      movementType: "receipt",
    });

    // No `page`, no `limit`: a total that depended on a page would not be a
    // total, and the server strips them anyway.
    expect(get).toHaveBeenCalledWith("/stock-movements/summary", {
      query: {
        productId: "p1",
        warehouseId: "wh1",
        batchId: undefined,
        movementType: "receipt",
        referenceType: undefined,
        referenceId: undefined,
        from: undefined,
        to: undefined,
      },
    });
  });

  it("export downloads a CSV under the same filters, with no limit", async () => {
    const download = jest
      .spyOn(apiClient, "download")
      .mockResolvedValue({ blob: new Blob(), filename: "kartu-stok.csv" });

    await stockMovementService.export({
      productId: "p1",
      warehouseId: "wh1",
      from: "2026-08-01T00:00:00.000Z",
    });

    expect(download).toHaveBeenCalledWith("/stock-movements/export", {
      query: expect.objectContaining({
        productId: "p1",
        warehouseId: "wh1",
        from: "2026-08-01T00:00:00.000Z",
        format: "csv",
      }),
      fallbackFilename: "kartu-stok.csv",
      timeoutMs: 60_000,
    });
    // An export that stopped at a page boundary would be a partial audit
    // document that opens and looks complete.
    expect(download.mock.calls[0][1].query).not.toHaveProperty("limit");
  });
});

describe("productBatchService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /product-batches and leaves hasRemaining unset by default", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.list({ productId: "p1", warehouseId: "wh1", limit: 100 });

    expect(get).toHaveBeenCalledWith("/product-batches", {
      query: {
        page: undefined,
        limit: 100,
        productId: "p1",
        warehouseId: "wh1",
        // Tri-state: unset returns exhausted lots too, which is what auditing a
        // sold-out lot needs.
        hasRemaining: undefined,
      },
    });
  });

  it("list passes hasRemaining through when a caller does want live lots only", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.list({ hasRemaining: true });

    expect(get).toHaveBeenCalledWith("/product-batches", {
      query: {
        page: undefined,
        limit: undefined,
        productId: undefined,
        warehouseId: undefined,
        hasRemaining: true,
      },
    });
  });

  it("expiring gets /product-batches/expiring", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.expiring({ warehouseId: "wh1", withinDays: 0 });

    expect(get).toHaveBeenCalledWith("/product-batches/expiring", {
      query: {
        page: undefined,
        limit: undefined,
        warehouseId: "wh1",
        // Zero is legitimate and means "expired or expiring today" — it must not
        // be dropped as falsy on its way to the URL.
        withinDays: 0,
      },
    });
  });

  it("getById gets /product-batches/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await productBatchService.getById("b1");

    expect(get).toHaveBeenCalledWith("/product-batches/b1");
  });
});
