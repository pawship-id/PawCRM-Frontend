import { posOfflineService } from "@/services/posOffline.service";
import { ApiError } from "@/services/api-error";
import type { PosShift, PosTransaction } from "@/types/api";

import { offlineTransport } from "@/features/pos/offline/transport";
import { getQueued, listQueued } from "@/features/pos/offline/queue";
import { localCatalog, localLots, tillReceipt } from "@/features/pos/offline/tillApi";
import { getOfflineState, setOfflineState, type OfflineSnapshot } from "@/features/pos/offline/store";
import { syncNow } from "@/features/pos/offline/sync";
import {
  __resetConnectivity,
  isOfflineMode,
  reportReachable,
  reportUnreachable,
  setForcedOffline,
} from "@/lib/connectivity";

jest.mock("@/services/posOffline.service", () => ({
  ...jest.requireActual("@/services/posOffline.service"),
  posOfflineService: {
    sync: jest.fn(),
    snapshot: jest.fn().mockRejectedValue(new Error("not in this test")),
    ping: jest.fn().mockResolvedValue({}),
  },
}));

const mockedOffline = posOfflineService as jest.Mocked<typeof posOfflineService>;

/**
 * POS OFFLINE MODE (19 October 2026) — the till's offline half end to end on
 * the device: a basket built and paid with no server, its slip, its place in
 * the queue, and the sync that sends it.
 */
const shift = {
  _id: "shift1",
  branchId: "b1",
  warehouseId: "w1",
  cashierUserId: "u1",
  status: "open",
} as unknown as PosShift;

const snapshot: OfflineSnapshot = {
  settings: {
    device: { _id: "d1", code: "K1", name: null },
    branch: { _id: "b1", code: "BRT", name: "Bintaro" },
    shift: { _id: "shift1", shiftNumber: "SHF-1", warehouseId: "w1", openedAt: "2026-10-19T00:00:00.000Z" },
    tax: { rate: "11", inclusive: true },
    numbering: {
      series: { key: "posTransaction", prefix: "POS", padding: 4, reset: "daily", separator: "-", timeZone: "Asia/Jakarta" },
      branchCode: "BRT",
      deviceCode: "K1",
      scope: "BRT-K1-261019",
      lastSequence: 0,
    },
    channels: [{ _id: "cash", type: "cash", name: "Tunai", requiresReference: false, branchId: null }],
    receiptHeader: { tenantName: "Buloo", branchName: "Bintaro", address: "", phone: "", receiptFooter: "Terima kasih" },
  },
  catalog: {
    items: [
      { kind: "product", _id: "p1", name: "Royal Canin 2kg", code: "RC2", barcode: "899001", batchCode: null, image: null, price: "250000", categoryId: "cat1", unit: "pcs", productType: "single", variantCount: null },
      { kind: "product", _id: "parent", name: "Snack", code: "SN", barcode: null, batchCode: null, image: null, price: null, categoryId: "cat1", unit: null, productType: "parent", variantCount: 1 },
      { kind: "product", _id: "v1", name: "Snack Ayam", code: "SN-A", barcode: null, batchCode: null, image: null, price: "15000", categoryId: "cat1", unit: "pcs", productType: "variant", parentId: "parent", variantCount: null },
      { kind: "service", _id: "s1", name: "Mandi", code: "MD", barcode: null, batchCode: null, image: null, price: "80000", categoryId: null, unit: null, variantCount: null, hasVariants: false, variantAxes: [], variants: [], addons: [], serviceType: "main" },
      { kind: "service", _id: "zone", name: "Grooming Rumah", code: "GR", barcode: null, batchCode: null, image: null, price: null, categoryId: null, unit: null, variantCount: null, hasVariants: true, variantAxes: ["zone"], variants: [], addons: [], serviceType: "main" },
    ],
    categories: [{ _id: "cat1", name: "Makanan", parentId: null }],
  } as unknown as OfflineSnapshot["catalog"],
  stock: { warehouseId: "w1", qty: { p1: "1.0000", v1: "10.0000" }, allowNegativeStock: true },
  customers: {
    customers: [{ _id: "c1", name: "Rina", phone: "0812", code: "CUS-1" }],
    pets: [{ _id: "pet1", customerId: "c1", name: "Mochi", species: "cat", size: null, furType: null }],
  },
  versions: {},
  fetchedAt: "2026-10-19T00:00:00.000Z",
  clockOffsetMs: 0,
};

const context = { tenantId: "t1", userId: "u1", userName: "Kasir Satu", maySetPrice: false };

beforeEach(() => {
  jest.clearAllMocks();
  setOfflineState({
    loaded: true,
    tenantId: "t1",
    device: {
      tenantId: "t1",
      deviceId: "d1",
      secret: "s",
      code: "K1",
      name: null,
      branchId: "b1",
      branchCode: "BRT",
      registeredAt: "2026-10-19T00:00:00.000Z",
    },
    snapshot,
    shift,
  });
});

describe("offline transport — a basket with no server", () => {
  it("builds, prices and pays a basket, queues the sale and prints its slip", async () => {
    const till = offlineTransport(context);
    const empty = await till.createCart();
    const cart = await till.updateCart(empty, {
      items: [{ kind: "product", refId: "p1", qty: "2" }],
      customerId: "c1",
    });

    expect(cart._id).toMatch(/^local-/);
    expect(cart.runningTotals.payable).toBe("500000.0000");
    expect(cart.customer?.name).toBe("Rina");

    const sale = await till.pay(cart, { payments: [{ channelId: "cash", amount: "500000" }] });
    expect(sale.status).toBe("paid");
    expect(sale.transactionNumber).toMatch(/^POS-BRT-K1-\d{6}-0001$/);

    const queued = await getQueued(sale._id);
    expect(queued?.status).toBe("pending");
    expect(queued?.sale).toMatchObject({
      shiftId: "shift1",
      cashierUserId: "u1",
      totals: { grandTotal: "500000.0000" },
      items: [{ kind: "product", refId: "p1", qty: "2" }],
    });
    expect(queued?.sale.receiptToken).toHaveLength(22);

    const receipt = await tillReceipt(sale._id);
    expect(receipt).toMatchObject({
      transactionNumber: sale.transactionNumber,
      header: { branchName: "Bintaro" },
      totals: { grandTotal: "500000.0000" },
      payments: [{ channelName: "Tunai" }],
    });

    // Paid baskets leave the device's basket list.
    await expect(till.findActive()).resolves.toBeNull();
  });

  it("adopts a server basket the connection dropped under, remembering it", async () => {
    const till = offlineTransport(context);
    const server = {
      _id: "64b000000000000000000abc",
      customerId: null,
      items: [{ kind: "product", refId: "p1", qty: "1.0000", unitPrice: "250000", listPrice: null, discount: null }],
      cartDiscount: null,
      otherCharges: [],
      note: null,
      heldLabel: null,
    } as unknown as PosTransaction;

    const local = await till.updateCart(server, { note: "titip" });
    expect(local._id).toMatch(/^local-/);
    expect(local.items).toHaveLength(1);

    const sale = await till.pay(local, { payments: [{ channelId: "cash", amount: "250000" }] });
    expect((await getQueued(sale._id))?.sale.replacesCartId).toBe("64b000000000000000000abc");
  });

  it("parks a basket on the device and lists it", async () => {
    const till = offlineTransport(context);
    const cart = await till.updateCart(await till.createCart(), {
      items: [{ kind: "product", refId: "p1", qty: "1" }],
    });
    await till.updateCart(cart, { status: "held" });
    expect((await till.listHeld()).map((held) => held._id)).toEqual([cart._id]);
  });

  it("refuses Sync Online, which needs other tills to see the basket", async () => {
    const till = offlineTransport(context);
    await expect(till.updateCart(await till.createCart(), { syncOnline: true })).rejects.toThrow(
      /butuh koneksi internet/,
    );
  });
});

describe("localCatalog — the grid from the snapshot", () => {
  it("shows one tile per family and hides what cannot be priced offline", () => {
    const names = localCatalog({ limit: 20 }).items.map((tile) => tile.name);
    expect(names).toEqual(["Royal Canin 2kg", "Snack", "Mandi"]);
  });

  it("opens a family's variants and finds by name, SKU and barcode", () => {
    expect(localCatalog({ parentId: "parent" }).items.map((tile) => tile._id)).toEqual(["v1"]);
    expect(localCatalog({ search: "royal" }).items[0]._id).toBe("p1");
    expect(localCatalog({ search: "899001", scan: true }).items[0]._id).toBe("p1");
  });

  it("takes unsent sales off the shelf count", () => {
    setOfflineState({ pendingQty: { p1: 3 } });
    const tile = localCatalog({ search: "royal" }).items[0];
    expect(tile.stock).toEqual({ qty: "-2", state: "out" });
    // The shop allows negative stock, so it still sells.
    expect(tile.sellable).toBe(true);
  });
});

/*
  A BATCH SCANNED WHILE OFFLINE (25 Oct 2026, BO) — the snapshot's lots find
  the product and name the lot, as the server would.
*/
describe("lots on the offline shelf", () => {
  const lot = (_id: string, batchCode: string, expiryDate: string, over = {}) => ({
    _id,
    batchCode,
    supplierBatchCode: null as string | null,
    expiryDate,
    qtyRemaining: "5.0000",
    ...over,
  });

  beforeEach(() => {
    setOfflineState({
      snapshot: {
        ...snapshot,
        stock: {
          ...snapshot.stock!,
          lots: {
            p1: [
              lot("old", "B2401-0001", "2024-01-31T00:00:00.000Z"),
              lot("b1", "B2610-0042", "2027-01-31T00:00:00.000Z", { supplierBatchCode: "SPL7" }),
              lot("b2", "B2610-0043", "2027-03-31T00:00:00.000Z", { supplierBatchCode: "SPL7" }),
            ],
          },
        },
      },
      pendingLotQty: {},
    });
  });

  it("finds the product by our lot code and names that lot", () => {
    const [tile] = localCatalog({ search: "B2610-0042", scan: true }).items;
    expect(tile._id).toBe("p1");
    expect(tile.scannedLot).toEqual({
      batchId: "b1",
      batchCode: "B2610-0042",
      expiryDate: "2027-01-31T00:00:00.000Z",
    });
  });

  it("reads a batch label's QR as a scanner types it, newlines dropped", () => {
    const [tile] = localCatalog({ search: "BULOOSKU:RC2BATCH:B2610-0043" }).items;
    expect(tile.scannedLot?.batchId).toBe("b2");
  });

  it("names no lot when the supplier's code is on two of ours", () => {
    const [tile] = localCatalog({ search: "SPL7", scan: true }).items;
    expect(tile._id).toBe("p1");
    expect(tile.scannedLot).toBeNull();
  });

  it("offers only lots in date, less what unsent sales named from them", () => {
    setOfflineState({ pendingLotQty: { b1: 5, b2: 2 } });
    expect(localLots("p1")).toEqual({
      hasExpiry: true,
      lots: [expect.objectContaining({ _id: "b2", qtyRemaining: "3" })],
    });
  });

  it("finds a typed piece of a lot code, as online, and names the code that matched", () => {
    const [tile] = localCatalog({ search: "spl" }).items;
    expect(tile._id).toBe("p1");
    expect(tile.batchCode).toBe("SPL7");
    expect(localCatalog({ search: "2610-0043" }).items[0].batchCode).toBe("B2610-0043");
  });

  it("says a product expires by its key in the snapshot, lots or none", () => {
    setOfflineState({
      snapshot: { ...snapshot, stock: { ...snapshot.stock!, lots: { p1: [] } } },
    });
    expect(localLots("p1")).toEqual({ hasExpiry: true, lots: [] });
    expect(localLots("v1")).toEqual({ hasExpiry: false, lots: [] });
  });

  /* SHORT ON PAPER (25 Oct 2026, BO): the shop's negative-stock setting decides. */
  const sellFromB1 = async (qty: string) => {
    const till = offlineTransport(context);
    return till.updateCart(await till.createCart(), {
      items: [{ kind: "product", refId: "p1", qty, lots: [{ batchId: "b1", qty }] }],
    });
  };

  it("sells from a lot short on paper where the shop allows negative stock", async () => {
    setOfflineState({ pendingLotQty: { b1: 4 } });
    const cart = await sellFromB1("3");
    expect(cart.items[0].lots).toEqual([
      { batchId: "b1", batchCode: "B2610-0042", qty: "3.0000" },
    ]);
  });

  it("refuses it, naming the lot, where the shop refuses negative stock", async () => {
    const current = getOfflineState().snapshot;
    setOfflineState({
      snapshot: { ...current, stock: { ...current.stock!, allowNegativeStock: false } },
      pendingLotQty: { b1: 4 },
    });
    await expect(sellFromB1("3")).rejects.toThrow(/Batch B2610-0042 hanya tersisa 1/);
  });

  it("prices and keeps a lot named on a basket", async () => {
    const till = offlineTransport(context);
    const cart = await till.updateCart(await till.createCart(), {
      items: [{ kind: "product", refId: "p1", qty: "1", lots: [{ batchId: "b1", qty: "1" }] }],
    });
    expect(cart.items[0].lots).toEqual([
      { batchId: "b1", batchCode: "B2610-0042", qty: "1.0000" },
    ]);
  });
});

describe("syncNow — sending the queue", () => {
  async function queueOne() {
    const till = offlineTransport(context);
    const cart = await till.updateCart(await till.createCart(), {
      items: [{ kind: "product", refId: "p1", qty: "1" }],
    });
    return till.pay(cart, { payments: [{ channelId: "cash", amount: "250000" }] });
  }

  it("marks each sale with the server's answer", async () => {
    const sale = await queueOne();
    mockedOffline.sync.mockImplementation(async (_device, sales) => ({
      serverTime: new Date().toISOString(),
      results: sales.map((one) => ({
        clientTxnId: one.clientTxnId,
        status: "synced" as const,
        posTransactionId: "srv1",
        flags: [{ code: "negative_stock", message: "Stok minus: Royal Canin 2kg" }],
      })),
    }));

    await syncNow();

    const record = await getQueued(sale._id);
    expect(record).toMatchObject({ status: "synced", posTransactionId: "srv1" });
    expect(record?.flags[0].code).toBe("negative_stock");
  });

  it("keeps the queue as it was when the server cannot be reached", async () => {
    const sale = await queueOne();
    mockedOffline.sync.mockRejectedValue(ApiError.network());

    await syncNow();

    expect((await getQueued(sale._id))?.status).toBe("pending");
  });

  it("isolates a sale the server refused as malformed", async () => {
    const good = await queueOne();
    const bad = await queueOne();
    mockedOffline.sync.mockImplementation(async (_device, sales) => {
      if (sales.length > 1 || sales[0].clientTxnId === bad._id) {
        throw new ApiError("Validation failed", 400);
      }
      return {
        serverTime: "",
        results: [{ clientTxnId: sales[0].clientTxnId, status: "synced" as const }],
      };
    });

    await syncNow();

    expect((await getQueued(good._id))?.status).toBe("synced");
    expect((await getQueued(bad._id))?.status).toBe("failed");
    expect((await listQueued()).length).toBe(2);
  });
});

describe("connectivity — hysteresis", () => {
  beforeEach(() => __resetConnectivity("online"));

  it("goes offline after two failures and back after two successes", () => {
    reportUnreachable();
    expect(isOfflineMode()).toBe(false);
    reportUnreachable();
    expect(isOfflineMode()).toBe(true);
    reportReachable();
    expect(isOfflineMode()).toBe(true);
    reportReachable();
    expect(isOfflineMode()).toBe(false);
  });

  it("honours the cashier's own switch", () => {
    setForcedOffline(true);
    expect(isOfflineMode()).toBe(true);
    setForcedOffline(false);
    expect(isOfflineMode()).toBe(false);
  });
});
