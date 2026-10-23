/**
 * SENDING THE QUEUE (POS offline mode, 19 October 2026).
 *
 * Runs whenever the till is on screen and the server answers: right after the
 * connection comes back, every 30 seconds while anything is unsent, and on the
 * "Kirim sekarang" button. Oldest first, twenty to a request. Every sale is
 * answered on its own, so one the server holds for review never blocks the
 * ones behind it.
 *
 * ONE TAB AT A TIME, through the Web Locks API where the browser has it — two
 * tabs of the same till sending the same queue would be harmless (the server is
 * idempotent) but twice the traffic on a connection that has little to spare.
 */
import { ApiError } from "@/services/api-error";
import { posOfflineService } from "@/services/posOffline.service";
import { isOfflineMode } from "@/lib/connectivity";

import { listQueued, purgeOld, refreshCounts, UNSENT, updateQueued } from "./queue";

/**
 * Tells the server how many unsent sales this device holds, per cashier — what
 * X-Report warns with when a cashier's takings are still on another till.
 */
export async function reportPending(): Promise<void> {
  const devices = registrations();
  if (!devices.length) return;
  const records = await listQueued();
  // Each registration reports its own branch's — X-Report asks per branch.
  for (const device of devices) {
    const byCashier = new Map<string, number>();
    for (const record of records) {
      if (record.deviceId !== device.deviceId || !UNSENT.includes(record.status)) continue;
      const id = record.sale.cashierUserId;
      byCashier.set(id, (byCashier.get(id) ?? 0) + 1);
    }
    const pendingByCashier = [...byCashier].map(([cashierUserId, count]) => ({ cashierUserId, count }));
    await posOfflineService
      .ping(device, pendingByCashier.reduce((sum, entry) => sum + entry.count, 0), pendingByCashier)
      .catch(() => {});
  }
}
import { refreshSnapshot } from "./snapshot";
import { getOfflineState, registrations, setOfflineState, type StoredDevice } from "./store";

const BATCH = 20;

async function withLock(run: () => Promise<void>): Promise<void> {
  const locks = (typeof navigator !== "undefined" ? navigator.locks : undefined) as
    | LockManager
    | undefined;
  if (!locks?.request) {
    await run();
    return;
  }
  await locks.request("buloo-pos-sync", { ifAvailable: true }, async (lock) => {
    if (lock) await run();
  });
}

async function sendBatch(
  device: StoredDevice,
  batch: Awaited<ReturnType<typeof listQueued>>,
): Promise<"ok" | "offline" | "rejected"> {
  const now = new Date().toISOString();
  try {
    const { results } = await posOfflineService.sync(
      device,
      batch.map((record) => record.sale),
    );
    for (const result of results) {
      await updateQueued(result.clientTxnId, {
        status: result.status,
        lastAttemptAt: now,
        attempts: (batch.find((record) => record.clientTxnId === result.clientTxnId)?.attempts ?? 0) + 1,
        syncedAt: result.status === "synced" ? now : null,
        posTransactionId: result.posTransactionId ?? null,
        reasons: result.reasons ?? [],
        flags: result.flags ?? [],
        message: result.message ?? null,
      });
    }
    return "ok";
  } catch (error) {
    if (error instanceof ApiError && (error.isNetworkError || error.isTimeout)) {
      return "offline";
    }
    if (error instanceof ApiError && error.status === 403) {
      // Only the branch on screen is "this device"; another one's refusal waits.
      if (device.deviceId === getOfflineState().device?.deviceId) {
        setOfflineState({ deviceRejected: error.message });
      }
      return "rejected";
    }
    /*
      A REQUEST THE SERVER REFUSED AS A WHOLE (a 400 from validation) — one
      malformed sale spoils its batch. Sent one by one, the good ones go through
      and the bad one is marked with the server's words.
    */
    if (batch.length > 1) {
      for (const record of batch) {
        const outcome = await sendBatch(device, [record]);
        if (outcome !== "ok") return outcome;
      }
      return "ok";
    }
    const record = batch[0];
    await updateQueued(record.clientTxnId, {
      status: "failed",
      lastAttemptAt: now,
      attempts: record.attempts + 1,
      message:
        error instanceof ApiError
          ? (error.reason ?? error.fullMessage ?? error.message)
          : "Transaksi ditolak server",
    });
    return "ok";
  }
}

/** Sends everything unsent. Resolves when done or when the server stops answering. */
export async function syncNow(): Promise<void> {
  const { syncing } = getOfflineState();
  if (!registrations().length || syncing) return;

  await withLock(async () => {
    setOfflineState({ syncing: true, lastSyncError: null });
    let sentAny = false;
    try {
      const unsent = (await listQueued())
        .filter((record) => UNSENT.includes(record.status))
        .sort((a, b) => a.sale.paidAt.localeCompare(b.sale.paidAt));

      /*
        EACH REGISTRATION SENDS ITS OWN SALES, under its own credentials — the
        server posts a sale at the branch of the device that rang it up. One
        whose registration this browser no longer holds cannot be sent at all.
      */
      for (const device of registrations()) {
        const mine = unsent.filter((record) => record.deviceId === device.deviceId);
        let failed = false;
        for (let start = 0; start < mine.length; start += BATCH) {
          const outcome = await sendBatch(device, mine.slice(start, start + BATCH));
          // A registration the server refuses keeps its sales; the others still go.
          if (outcome === "rejected") break;
          if (outcome === "offline") {
            setOfflineState({ lastSyncError: "Server belum bisa dihubungi" });
            failed = true;
            break;
          }
          sentAny = true;
        }
        if (failed) break;
      }
      setOfflineState({ lastSyncAt: new Date().toISOString() });
    } finally {
      await refreshCounts();
      setOfflineState({ syncing: false });
    }

    // What was sold is now on the server; the shelf counts here are stale.
    if (sentAny) {
      void refreshSnapshot();
      void reportPending();
    }
    void purgeOld();
  });
}

const SYNC_INTERVAL_MS = 30_000;
const PING_INTERVAL_MS = 60_000;
const SNAPSHOT_INTERVAL_MS = 5 * 60_000;

let running = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastPing = 0;
let lastSnapshot = 0;

async function tick() {
  if (isOfflineMode()) return;
  const state = getOfflineState();
  if (!registrations().length) return;

  if (state.pendingCount > 0) await syncNow();

  const now = Date.now();
  if (now - lastSnapshot > SNAPSHOT_INTERVAL_MS) {
    lastSnapshot = now;
    void refreshSnapshot();
  }
  if (now - lastPing > PING_INTERVAL_MS) {
    lastPing = now;
    void reportPending();
  }
}

/** Starts the background loop while a till is mounted; returns the stop. */
export function startSyncLoop(): () => void {
  running += 1;
  if (running === 1) {
    lastSnapshot = Date.now();
    timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  }
  return () => {
    running -= 1;
    if (running === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
