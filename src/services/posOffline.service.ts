import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  OfflineSaleInput,
  OfflineSnapshotResponse,
  OfflineSubmission,
  OfflineSyncResult,
  PosDevice,
  PosNumberingInfo,
  RegisteredPosDevice,
} from "@/types/posOffline";

/**
 * The till's device and offline endpoints (POS offline mode, 19 October 2026).
 * A registered device names itself in two headers on every call that needs to
 * know which till is asking — see the backend's posOffline.controller.
 */
export interface DeviceCredentials {
  deviceId: string;
  secret: string;
}

export function deviceHeaders(device: DeviceCredentials | null): Record<string, string> {
  return device
    ? { "X-Pos-Device-Id": device.deviceId, "X-Pos-Device-Secret": device.secret }
    : {};
}

export const posOfflineService = {
  registerDevice: (input: { branchId?: string; name: string }) =>
    apiClient.post<RegisteredPosDevice>("/pos/devices", input),

  listDevices: (query: { branchId?: string } = {}) =>
    apiClient.get<PosDevice[]>("/pos/devices", { query }),

  updateDevice: (id: string, input: { name?: string; isActive?: boolean }) =>
    apiClient.patch<PosDevice>(`/pos/devices/${id}`, input),

  currentDevice: (device: DeviceCredentials) =>
    apiClient.get<PosDevice>("/pos/devices/current", {
      headers: deviceHeaders(device),
      timeoutMs: 8_000,
    }),

  ping: (
    device: DeviceCredentials,
    pendingCount: number,
    pendingByCashier: Array<{ cashierUserId: string; count: number }> = [],
  ) =>
    apiClient.post<{ serverTime: string }>(
      "/pos/devices/current/ping",
      { pendingCount, pendingByCashier },
      { headers: deviceHeaders(device), timeoutMs: 6_000 },
    ),

  numbering: (device: DeviceCredentials) =>
    apiClient.get<PosNumberingInfo>("/pos/devices/current/numbering", {
      headers: deviceHeaders(device),
      timeoutMs: 6_000,
    }),

  snapshot: (
    device: DeviceCredentials,
    versions: { catalog?: string; stock?: string; customers?: string },
  ) =>
    apiClient.get<OfflineSnapshotResponse>("/pos/offline/snapshot", {
      headers: deviceHeaders(device),
      query: versions,
      timeoutMs: 30_000,
    }),

  sync: (device: DeviceCredentials, sales: OfflineSaleInput[]) =>
    apiClient.post<{ results: OfflineSyncResult[]; serverTime: string }>(
      "/pos/offline/sync",
      { sales },
      { headers: deviceHeaders(device), timeoutMs: 30_000 },
    ),

  listSubmissions: (
    query: { page?: number; limit?: number; branchId?: string; status?: string; open?: boolean } = {},
  ) => apiClient.get<PageResult<OfflineSubmission>>("/pos/offline/submissions", { query }),

  countOpen: (branchId?: string) =>
    apiClient.get<{ count: number }>("/pos/offline/submissions/count", {
      query: { branchId },
    }),

  resolve: (id: string, input: { action: "retry" | "accept" | "reject"; note?: string | null }) =>
    apiClient.post<OfflineSubmission>(`/pos/offline/submissions/${id}/resolve`, input),
};
