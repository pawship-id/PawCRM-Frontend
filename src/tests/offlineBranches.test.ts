import { posOfflineService } from "@/services/posOffline.service";
import { posService } from "@/services/pos.service";
import type { PosTransaction } from "@/types/api";

import { payOnline } from "@/features/pos/offline/devicePay";
import { kvGet, kvSet } from "@/features/pos/offline/idb";
import { enqueue, getQueued, type QueuedSale } from "@/features/pos/offline/queue";
import {
  __resetOfflineStore,
  getOfflineState,
  loadOfflineState,
  saveDevice,
  type StoredDevice,
} from "@/features/pos/offline/store";
import { syncNow } from "@/features/pos/offline/sync";

jest.mock("@/services/posOffline.service", () => ({
  ...jest.requireActual("@/services/posOffline.service"),
  posOfflineService: {
    sync: jest.fn(),
    snapshot: jest.fn().mockRejectedValue(new Error("not in this test")),
    ping: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/services/pos.service", () => ({
  posService: { pay: jest.fn() },
}));

const mockedOffline = posOfflineService as jest.Mocked<typeof posOfflineService>;
const mockedPos = posService as jest.Mocked<typeof posService>;

/**
 * ONE BROWSER, SEVERAL BRANCHES (20 October 2026): a till registered at one
 * shop and carried to another holds a registration per branch, numbers each
 * shop's sales under that shop's own, and still sends the first shop's.
 */
function registration(branchId: string, branchCode: string, deviceId: string): StoredDevice {
  return {
    tenantId: "t1",
    deviceId,
    secret: `secret-${deviceId}`,
    code: "K1",
    name: null,
    branchId,
    branchCode,
    registeredAt: "2026-10-19T00:00:00.000Z",
  };
}

const pusat = registration("b1", "PST", "d1");
const barat = registration("b2", "BRT", "d2");

beforeEach(() => {
  jest.clearAllMocks();
  __resetOfflineStore();
});

describe("registrations per branch", () => {
  it("moves the old single registration under its branch", async () => {
    await kvSet("device:t1", pusat);

    await loadOfflineState("t1", "b1");

    expect(getOfflineState().device?.deviceId).toBe("d1");
    expect(await kvGet("device:t1")).toBeUndefined();
    expect(await kvGet("devices:t1")).toEqual({ b1: pusat });
  });

  it("keeps the first branch's registration when registering at a second", async () => {
    await loadOfflineState("t1", "b1");
    await saveDevice(pusat);

    __resetOfflineStore();
    await loadOfflineState("t1", "b2");
    expect(getOfflineState().device).toBeNull();
    await saveDevice(barat);

    expect(getOfflineState().device?.deviceId).toBe("d2");
    expect(getOfflineState().devices.map((entry) => entry.deviceId).sort()).toEqual(["d1", "d2"]);

    __resetOfflineStore();
    await loadOfflineState("t1", "b1");
    expect(getOfflineState().device?.deviceId).toBe("d1");
  });
});

describe("selling at the second branch", () => {
  it("still sends the first branch's sales, with the first branch's credentials", async () => {
    await kvSet("devices:t1", { b1: pusat, b2: barat });
    await loadOfflineState("t1", "b2");
    await enqueue({
      clientTxnId: "ctx-pusat01",
      tenantId: "t1",
      deviceId: "d1",
      sale: { clientTxnId: "ctx-pusat01", paidAt: "2026-10-19T03:00:00.000Z", cashierUserId: "u1", items: [] },
      status: "pending",
      attempts: 0,
    } as unknown as QueuedSale);
    mockedOffline.sync.mockImplementation(async (_device, sales) => ({
      serverTime: "",
      results: sales.map((one) => ({ clientTxnId: one.clientTxnId, status: "synced" as const })),
    }));

    await syncNow();

    expect(mockedOffline.sync).toHaveBeenCalledTimes(1);
    expect(mockedOffline.sync.mock.calls[0][0]).toMatchObject({ deviceId: "d1" });
    expect((await getQueued("ctx-pusat01"))?.status).toBe("synced");
  });

  it("lets the server number a basket at a branch this registration is not for", async () => {
    await kvSet("devices:t1", { b1: pusat });
    await loadOfflineState("t1", "b1");
    const cart = { _id: "cart1", branchId: "b2" } as unknown as PosTransaction;
    const input = { payments: [{ channelId: "cash", amount: "95000" }] };

    await payOnline(cart, input);

    expect(mockedPos.pay).toHaveBeenCalledWith("cart1", input);
  });
});
