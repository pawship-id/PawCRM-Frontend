/**
 * THE SALES THIS DEVICE RANG UP OFFLINE (POS offline mode, 19 October 2026),
 * held until the server has answered for each one.
 *
 * A record is never deleted the moment it syncs: the cashier may still need to
 * reprint its slip, and "Transaksi offline" lists the day's. Synced records are
 * purged after three days; anything the server has not accepted is kept until
 * it has.
 */
import type { PosTransaction } from "@/types/api";
import type { OfflineReason, OfflineSaleInput, OfflineSyncStatus } from "@/types/posOffline";

import { queueAll, queueDelete, queueGet, queuePut } from "./idb";
import { getOfflineState, setOfflineState } from "./store";

export type QueueStatus = OfflineSyncStatus | "failed";

export interface QueuedSale {
  clientTxnId: string;
  tenantId: string;
  deviceId: string;
  sale: OfflineSaleInput;
  /** The basket as the customer saw it — what the slip is reprinted from. */
  priced: PosTransaction;
  /** Channel names, for the slip, beside the ids the server needs. */
  paymentNames: Array<{ channelType: string; channelName: string }>;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  posTransactionId: string | null;
  reasons: OfflineReason[];
  flags: OfflineReason[];
  message: string | null;
}

const KEEP_SYNCED_MS = 3 * 24 * 60 * 60 * 1000;

/** Statuses the sync engine still has to send. */
export const UNSENT: QueueStatus[] = ["pending", "waiting_cashier"];

export async function enqueue(record: QueuedSale): Promise<void> {
  await queuePut(record);
  await refreshCounts();
}

export async function updateQueued(
  clientTxnId: string,
  patch: Partial<QueuedSale>,
): Promise<QueuedSale | null> {
  const current = await queueGet<QueuedSale>(clientTxnId);
  if (!current) return null;
  const next = { ...current, ...patch };
  await queuePut(next);
  return next;
}

export async function getQueued(clientTxnId: string): Promise<QueuedSale | null> {
  return (await queueGet<QueuedSale>(clientTxnId)) ?? null;
}

/** This device's records for the current tenant, newest first. */
export async function listQueued(): Promise<QueuedSale[]> {
  const { tenantId, device } = getOfflineState();
  const all = await queueAll<QueuedSale>();
  return all
    .filter((record) => record.tenantId === tenantId && (!device || record.deviceId === device.deviceId))
    .sort((a, b) => b.sale.paidAt.localeCompare(a.sale.paidAt));
}

/** Drops synced records older than three days. */
export async function purgeOld(): Promise<void> {
  const cutoff = Date.now() - KEEP_SYNCED_MS;
  for (const record of await queueAll<QueuedSale>()) {
    if (record.status === "synced" && new Date(record.syncedAt ?? record.createdAt).getTime() < cutoff) {
      await queueDelete(record.clientTxnId);
    }
  }
}

export async function refreshCounts(): Promise<void> {
  const records = await listQueued();
  const pendingQty: Record<string, number> = {};
  for (const record of records) {
    if (!UNSENT.includes(record.status)) continue;
    for (const item of record.sale.items) {
      if (item.kind !== "product") continue;
      pendingQty[item.refId] = (pendingQty[item.refId] ?? 0) + Number(item.qty ?? "1");
    }
  }
  setOfflineState({
    pendingQty,
    pendingCount: records.filter((record) => UNSENT.includes(record.status)).length,
    reviewCount: records.filter((record) => record.status === "needs_review" || record.status === "failed").length,
  });
}

/** Unsent sales belonging to `cashierUserId` — blocks signing out and closing the shift. */
export async function unsentFor(cashierUserId: string, shiftId?: string): Promise<number> {
  const records = await listQueued();
  return records.filter(
    (record) =>
      UNSENT.includes(record.status) &&
      record.sale.cashierUserId === cashierUserId &&
      (!shiftId || record.sale.shiftId === shiftId),
  ).length;
}
