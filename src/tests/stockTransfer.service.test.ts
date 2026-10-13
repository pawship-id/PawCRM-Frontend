import { apiClient } from "@/services/api-client";
import { stockTransferService } from "@/services/stockTransfer.service";

/**
 * The transfer service is a thin typed seam, so what is worth pinning is the
 * wire: which verb and path each step of a transfer's life uses, and that the
 * list sends only what was asked for.
 */
afterEach(() => jest.restoreAllMocks());

const INPUT = {
  fromWarehouseId: "w1",
  toWarehouseId: "w2",
  items: [{ productId: "p1", qty: "5" }],
};

it("lists with the filters the API names, sending none that is unset", async () => {
  const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

  await stockTransferService.list({ status: "in_transit", search: "TRF" });

  expect(get).toHaveBeenCalledWith("/stock-transfers", {
    query: {
      page: undefined,
      limit: undefined,
      warehouseId: undefined,
      status: "in_transit",
      from: undefined,
      to: undefined,
      search: "TRF",
      sort: undefined,
    },
  });
});

it("reads one document by its id", async () => {
  const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

  await stockTransferService.getById("t1");

  expect(get).toHaveBeenCalledWith("/stock-transfers/t1");
});

it("files a transfer with POST", async () => {
  const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

  await stockTransferService.create({ ...INPUT, idempotencyKey: "key-12345678" });

  expect(post).toHaveBeenCalledWith(
    "/stock-transfers",
    { ...INPUT, idempotencyKey: "key-12345678" },
    // A large transfer may take longer than the client's 15-second default.
    { timeoutMs: 60_000 },
  );
});

it("edits with PATCH, sending the whole document again", async () => {
  const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);

  await stockTransferService.update("t1", INPUT);

  expect(patch).toHaveBeenCalledWith("/stock-transfers/t1", INPUT, {
    timeoutMs: 60_000,
  });
});

it("receives and cancels with their own verbs, carrying no body", async () => {
  const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

  await stockTransferService.receive("t1");
  await stockTransferService.cancel("t1");

  expect(post).toHaveBeenNthCalledWith(
    1,
    "/stock-transfers/t1/receive",
    undefined,
    { timeoutMs: 60_000 },
  );
  expect(post).toHaveBeenNthCalledWith(
    2,
    "/stock-transfers/t1/cancel",
    undefined,
    { timeoutMs: 60_000 },
  );
});

it("exposes no delete — a transfer that should not have happened is cancelled", () => {
  expect(Object.keys(stockTransferService).sort()).toEqual([
    "cancel",
    "create",
    "getById",
    "list",
    "receive",
    "update",
  ]);
});
