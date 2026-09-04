import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { apiClient } from "@/services/api-client";
import type { PurchaseReturnListQuery } from "@/types/api";

/**
 * The purchase-return module's HTTP contract: paths, verbs and query shapes.
 *
 * apiClient is spied on rather than fetch, so these assert what the service ASKS
 * FOR without a server — the same level goodsReceipt.service.test.ts works at.
 *
 * THIS FILE USED TO ASSERT THE OPPOSITE. While the returns screens ran on the
 * prototype store, the service deliberately wrapped `list` alone and a test
 * pinned that (`expect(Object.keys(...)).toEqual(["list"])`), so nobody could add
 * a write by accident and end up with two ways to return goods. The screens are
 * converted; the writes are the point now.
 */
/**
 * Every filter `PurchaseReturnListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` IS THE POINT. `list` spells its query out as an object literal,
 * one key at a time, and anything absent from that literal is dropped in
 * silence — which is how `sort` reached the catalogue and the supplier list
 * without ever reaching the wire (see product.service.test.ts and
 * supplier.service.test.ts). A screen test cannot catch it because it mocks the
 * service.
 *
 * With this type, adding a field to `PurchaseReturnListQuery` breaks THIS OBJECT
 * at compile time until it is listed here, and then breaks the assertion below
 * until `list` actually sends it.
 */
const EVERY_FILTER: Required<PurchaseReturnListQuery> = {
  page: 2,
  limit: 20,
  search: "PR-2608",
  supplierId: "s1",
  warehouseId: "wh1",
  originalReceiptId: "gr1",
  status: "draft",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  sort: "numberAsc",
};

describe("purchaseReturnService", () => {
  afterEach(() => jest.restoreAllMocks());

  describe("list", () => {
    it("forwards every filter it is given — nothing is dropped on the way out", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseReturnService.list(EVERY_FILTER);

      const [path, options] = get.mock.calls[0] as [
        string,
        { query: Record<string, unknown> },
      ];
      expect(path).toBe("/purchase-returns");

      for (const [key, value] of Object.entries(EVERY_FILTER)) {
        expect(options.query[key]).toBe(value);
      }
    });

    it("sends the ordering the caller asked for", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseReturnService.list({ sort: "numberDesc" });

      expect(get).toHaveBeenCalledWith(
        "/purchase-returns",
        expect.objectContaining({
          query: expect.objectContaining({ sort: "numberDesc" }),
        }),
      );
    });

    /** How a goods-receipt screen answers "has this already been sent back?". */
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

    it("asks for the collection root when nothing is filtered", async () => {
      const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

      await purchaseReturnService.list();

      const [path] = get.mock.calls[0];
      expect(path).toBe("/purchase-returns");
    });
  });

  it("reads one return by id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await purchaseReturnService.getById("pr1");

    expect(get).toHaveBeenCalledWith("/purchase-returns/pr1");
  });

  describe("create", () => {
    it("posts a draft to the collection root", async () => {
      const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

      const input = {
        originalReceiptId: "gr1",
        returnDate: "2026-08-07",
        items: [
          { originalReceiptItemId: "it1", qty: "4", reason: "Rusak" },
        ],
      };

      await purchaseReturnService.create(input);

      expect(post).toHaveBeenCalledWith("/purchase-returns", input);
    });

    /**
     * THE WRITE SURFACE IS THREE FIELDS PER LINE. Everything else — the product,
     * the lot, the unit cost, the subtotal — is copied server-side from the
     * traced receipt line. A client able to send `costPerUnit` could restate the
     * cost basis every later sale is costed at, which is the one thing this
     * module exists to prevent.
     */
    it("sends only the traced line, the quantity and the reason", async () => {
      const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

      await purchaseReturnService.create({
        originalReceiptId: "gr1",
        items: [{ originalReceiptItemId: "it1", qty: "4", reason: "Rusak" }],
      });

      const [, body] = post.mock.calls[0] as [string, { items: object[] }];
      expect(Object.keys(body.items[0]).sort()).toEqual([
        "originalReceiptItemId",
        "qty",
        "reason",
      ]);
    });

    // The server defaults it to now. Omitting is how "today" is expressed.
    it("omits returnDate entirely when the caller does not set one", async () => {
      const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

      await purchaseReturnService.create({
        originalReceiptId: "gr1",
        items: [{ originalReceiptItemId: "it1", qty: "4", reason: "Rusak" }],
      });

      const [, body] = post.mock.calls[0] as [string, object];
      expect(body).not.toHaveProperty("returnDate");
    });
  });

  describe("update", () => {
    it("patches the draft by id", async () => {
      const patch = jest
        .spyOn(apiClient, "patch")
        .mockResolvedValue({} as never);

      const input = {
        returnDate: "2026-08-09",
        items: [{ originalReceiptItemId: "it1", qty: "6", reason: "Rusak" }],
      };

      await purchaseReturnService.update("pr1", input);

      expect(patch).toHaveBeenCalledWith("/purchase-returns/pr1", input);
    });

    /**
     * `items` replaces the stored array wholesale, so removing a line is sending
     * the list without it. The service must not merge, dedupe or reorder — the
     * only honest statement of "what is going back" is the list just sent.
     */
    it("sends the line list verbatim, without merging", async () => {
      const patch = jest
        .spyOn(apiClient, "patch")
        .mockResolvedValue({} as never);

      const items = [
        { originalReceiptItemId: "it2", qty: "1", reason: "Kadaluarsa" },
        { originalReceiptItemId: "it1", qty: "2", reason: "Rusak" },
      ];

      await purchaseReturnService.update("pr1", { items });

      const [, body] = patch.mock.calls[0] as [string, { items: object[] }];
      expect(body.items).toEqual(items);
    });
  });

  it("previews by POSTing to the return's own subpath", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    await purchaseReturnService.preview("pr1");

    expect(post).toHaveBeenCalledWith("/purchase-returns/pr1/preview");
  });

  it("submits by POSTing to the return's own subpath", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);

    await purchaseReturnService.submit("pr1");

    expect(post).toHaveBeenCalledWith("/purchase-returns/pr1/submit");
  });

  it("discards a draft with DELETE", async () => {
    const remove = jest
      .spyOn(apiClient, "delete")
      .mockResolvedValue({} as never);

    await purchaseReturnService.remove("pr1");

    expect(remove).toHaveBeenCalledWith("/purchase-returns/pr1");
  });

  /**
   * The whole workflow, and nothing beyond it. There is deliberately no
   * `unsubmit` and no `restore`: submitting posts stock movements and a journal
   * entry that are both immutable, so a return that could go back to draft would
   * claim to describe goods whose departure had already been booked. If somebody
   * adds one, they have to delete this test to do it — and that is a
   * conversation, not an accident.
   */
  it("exposes the draft workflow and nothing more", () => {
    expect(Object.keys(purchaseReturnService).sort()).toEqual([
      "create",
      "getById",
      "list",
      "preview",
      "remove",
      "submit",
      "update",
    ]);
  });
});
