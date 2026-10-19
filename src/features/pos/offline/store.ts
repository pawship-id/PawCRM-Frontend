/**
 * The till's offline state, in memory and on the device (POS offline mode,
 * 19 October 2026): which registered device this browser is, the latest
 * snapshot of what it needs to sell, and the shift it is selling into.
 *
 * ONE MODULE-LEVEL STORE, read through `useOfflineStore`, because three
 * unrelated corners of the till (the catalogue, the cart, the payment dialog)
 * all need the same answers and none of them owns the others. IndexedDB holds
 * the durable copy; this holds the copy a render reads synchronously.
 */
import { useSyncExternalStore } from "react";

import type { PosShift } from "@/types/api";
import type {
  OfflineCatalogSection,
  OfflineCustomersSection,
  OfflineSettings,
  OfflineStockSection,
} from "@/types/posOffline";
import type { DeviceCredentials } from "@/services/posOffline.service";

import { kvDelete, kvGet, kvSet } from "./idb";

export interface StoredDevice extends DeviceCredentials {
  tenantId: string;
  code: string;
  name: string | null;
  branchId: string;
  branchCode: string | null;
  registeredAt: string;
}

export interface OfflineSnapshot {
  settings: OfflineSettings | null;
  catalog: OfflineCatalogSection | null;
  stock: OfflineStockSection | null;
  customers: OfflineCustomersSection | null;
  versions: { catalog?: string; stock?: string; customers?: string };
  fetchedAt: string | null;
  /** server time − device time, in ms, measured at the last snapshot. */
  clockOffsetMs: number;
}

export interface OfflineState {
  /** False until the device record has been read from storage. */
  loaded: boolean;
  tenantId: string | null;
  device: StoredDevice | null;
  /** The server refused this device (switched off, or unknown). */
  deviceRejected: string | null;
  snapshot: OfflineSnapshot;
  /** The cashier's open shift, as last confirmed online. */
  shift: PosShift | null;
  /** Sales waiting to be sent, and the latest sync outcome. */
  pendingCount: number;
  reviewCount: number;
  /** Units of each product in unsent sales — taken off the shelf counts shown. */
  pendingQty: Record<string, number>;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

const EMPTY_SNAPSHOT: OfflineSnapshot = {
  settings: null,
  catalog: null,
  stock: null,
  customers: null,
  versions: {},
  fetchedAt: null,
  clockOffsetMs: 0,
};

let state: OfflineState = {
  loaded: false,
  tenantId: null,
  device: null,
  deviceRejected: null,
  snapshot: EMPTY_SNAPSHOT,
  shift: null,
  pendingCount: 0,
  reviewCount: 0,
  pendingQty: {},
  syncing: false,
  lastSyncAt: null,
  lastSyncError: null,
};

const listeners = new Set<() => void>();

export function getOfflineState(): OfflineState {
  return state;
}

export function setOfflineState(patch: Partial<OfflineState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE = state;

export function useOfflineStore(): OfflineState {
  return useSyncExternalStore(subscribe, getOfflineState, () => SERVER_STATE);
}

/* ─────────────────────────── durable keys ─────────────────────────── */

const deviceKey = (tenantId: string) => `device:${tenantId}`;
const snapshotKey = (deviceId: string) => `snapshot:${deviceId}`;
const shiftKey = (tenantId: string, userId: string, branchId: string) =>
  `shift:${tenantId}:${userId}:${branchId}`;

/**
 * Loads this browser's device record and its last snapshot for `tenantId`.
 * Called once per tenant as the till mounts; cheap to call again.
 */
export async function loadOfflineState(tenantId: string): Promise<void> {
  if (state.loaded && state.tenantId === tenantId) return;

  const device = (await kvGet<StoredDevice>(deviceKey(tenantId))) ?? null;
  const snapshot = device
    ? ((await kvGet<OfflineSnapshot>(snapshotKey(device.deviceId))) ?? EMPTY_SNAPSHOT)
    : EMPTY_SNAPSHOT;

  setOfflineState({
    loaded: true,
    tenantId,
    device,
    deviceRejected: null,
    snapshot,
  });
}

export async function saveDevice(device: StoredDevice): Promise<void> {
  await kvSet(deviceKey(device.tenantId), device);
  setOfflineState({ device, deviceRejected: null, snapshot: EMPTY_SNAPSHOT });
}

export async function forgetDevice(tenantId: string): Promise<void> {
  const current = state.device;
  await kvDelete(deviceKey(tenantId));
  if (current) await kvDelete(snapshotKey(current.deviceId));
  setOfflineState({ device: null, snapshot: EMPTY_SNAPSHOT });
}

export async function saveSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  const device = state.device;
  if (!device) return;
  await kvSet(snapshotKey(device.deviceId), snapshot);
  setOfflineState({ snapshot });
}

export async function rememberShift(
  tenantId: string,
  userId: string,
  branchId: string,
  shift: PosShift | null,
): Promise<void> {
  if (shift) await kvSet(shiftKey(tenantId, userId, branchId), shift);
  else await kvDelete(shiftKey(tenantId, userId, branchId));
  setOfflineState({ shift });
}

export async function recallShift(
  tenantId: string,
  userId: string,
  branchId: string,
): Promise<PosShift | null> {
  return (await kvGet<PosShift>(shiftKey(tenantId, userId, branchId))) ?? null;
}

/** The device's clock corrected to the server's, as last measured. */
export function serverNow(): Date {
  return new Date(Date.now() + (state.snapshot.clockOffsetMs ?? 0));
}

/** Tests only. */
export function __resetOfflineStore(): void {
  state = {
    loaded: false,
    tenantId: null,
    device: null,
    deviceRejected: null,
    snapshot: EMPTY_SNAPSHOT,
    shift: null,
    pendingCount: 0,
    reviewCount: 0,
    pendingQty: {},
    syncing: false,
    lastSyncAt: null,
    lastSyncError: null,
  };
  listeners.forEach((listener) => listener());
}
