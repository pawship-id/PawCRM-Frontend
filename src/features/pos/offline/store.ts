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
  /** The branch the till is selling at — which registration `device` is. */
  branchId: string | null;
  /** This browser's registration for `branchId`, if it has one. */
  device: StoredDevice | null;
  /**
   * Every registration this browser holds for the tenant, one per branch
   * (20 October 2026) — a till carried from one shop to another keeps the
   * first shop's sales and sends them with that shop's credentials.
   */
  devices: StoredDevice[];
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
  branchId: null,
  device: null,
  devices: [],
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

/**
 * ONE REGISTRATION PER BRANCH (20 October 2026). A device's code, counter and
 * offline copy all belong to the branch it was registered at, so a browser used
 * at two shops holds two registrations, keyed by branch, and sells at each
 * under that shop's own.
 */
const devicesKey = (tenantId: string) => `devices:${tenantId}`;
/** Before 20 October 2026: a single registration per tenant. Read once, then moved. */
const legacyDeviceKey = (tenantId: string) => `device:${tenantId}`;
const snapshotKey = (deviceId: string) => `snapshot:${deviceId}`;
const shiftKey = (tenantId: string, userId: string, branchId: string) =>
  `shift:${tenantId}:${userId}:${branchId}`;

type DeviceMap = Record<string, StoredDevice>;

async function readDevices(tenantId: string): Promise<DeviceMap> {
  const map = (await kvGet<DeviceMap>(devicesKey(tenantId))) ?? {};
  const legacy = await kvGet<StoredDevice>(legacyDeviceKey(tenantId));
  if (!legacy) return map;

  const migrated = { [legacy.branchId]: legacy, ...map };
  await kvSet(devicesKey(tenantId), migrated);
  await kvDelete(legacyDeviceKey(tenantId));
  return migrated;
}

/** Every registration this browser holds for the tenant — the sync sends for each. */
export function registrations(): StoredDevice[] {
  const { device, devices } = state;
  if (!device || devices.some((entry) => entry.deviceId === device.deviceId)) return devices;
  return [...devices, device];
}

/**
 * Loads this browser's registrations for `tenantId`, and the one (with its last
 * snapshot) for the branch it is selling at. Called as the till mounts and
 * again whenever the branch changes; cheap to call again.
 */
export async function loadOfflineState(tenantId: string, branchId: string | null): Promise<void> {
  if (state.loaded && state.tenantId === tenantId && state.branchId === branchId) return;

  const map = await readDevices(tenantId);
  const device = branchId ? (map[branchId] ?? null) : null;
  const snapshot = device
    ? ((await kvGet<OfflineSnapshot>(snapshotKey(device.deviceId))) ?? EMPTY_SNAPSHOT)
    : EMPTY_SNAPSHOT;

  setOfflineState({
    loaded: true,
    tenantId,
    branchId,
    device,
    devices: Object.values(map),
    deviceRejected: null,
    snapshot,
  });
}

export async function saveDevice(device: StoredDevice): Promise<void> {
  const map = await readDevices(device.tenantId);
  const replaced = map[device.branchId];
  map[device.branchId] = device;
  await kvSet(devicesKey(device.tenantId), map);
  if (replaced && replaced.deviceId !== device.deviceId) {
    await kvDelete(snapshotKey(replaced.deviceId));
  }

  const patch: Partial<OfflineState> = { devices: Object.values(map) };
  if (!state.branchId || state.branchId === device.branchId) {
    const same = state.device?.deviceId === device.deviceId;
    Object.assign(patch, {
      device,
      deviceRejected: null,
      snapshot: same ? state.snapshot : EMPTY_SNAPSHOT,
    });
  }
  setOfflineState(patch);
}

/** Forgets this browser's registration for the branch it is selling at. */
export async function forgetDevice(tenantId: string): Promise<void> {
  const current = state.device;
  if (!current) return;
  const map = await readDevices(tenantId);
  delete map[current.branchId];
  await kvSet(devicesKey(tenantId), map);
  await kvDelete(snapshotKey(current.deviceId));
  setOfflineState({ device: null, devices: Object.values(map), snapshot: EMPTY_SNAPSHOT });
}

/**
 * Stores `snapshot` for `deviceId` (the current registration when omitted). A
 * download that finishes after the branch changed is kept for its own
 * registration and never shown as the new branch's.
 */
export async function saveSnapshot(snapshot: OfflineSnapshot, deviceId?: string): Promise<void> {
  const target = deviceId ?? state.device?.deviceId;
  if (!target) return;
  await kvSet(snapshotKey(target), snapshot);
  if (state.device?.deviceId === target) setOfflineState({ snapshot });
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
    branchId: null,
    device: null,
    devices: [],
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
