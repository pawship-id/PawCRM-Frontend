"use client";

/**
 * THE TILL'S OFFLINE HALF, AS ONE HOOK (POS offline mode, 19 October 2026).
 *
 * Mounted by `PosScreen`. It starts the connection watch and the sync loop,
 * loads this browser's device record, keeps the snapshot fresh while online,
 * and answers the one question the screen asks on every render: is this till
 * selling from the server or from the device right now?
 *
 * OFFLINE SELLING NEEDS ALL FOUR: a registered device, a snapshot, a shift
 * confirmed online, and the connection actually down (or the cashier's own
 * "Pakai mode offline"). Missing any of the first three, a lost connection is
 * shown for what it is and the till waits — it never guesses.
 */
import { useCallback, useEffect, useMemo } from "react";

import { useAuth } from "@/features/auth";
import { usePermissions } from "@/features/permissions";
import { useConnectivity } from "@/hooks/useConnectivity";
import { startConnectivityWatch } from "@/lib/connectivity";
import { ApiError } from "@/services/api-error";
import { posOfflineService } from "@/services/posOffline.service";

import type { CartTransportChoice } from "../hooks/usePosCart";
import { isLocalId } from "./ids";
import { refreshCounts } from "./queue";
import { refreshSnapshot, snapshotReady } from "./snapshot";
import { seedTillChannels } from "../hooks/tillChannels";
import {
  forgetDevice,
  getOfflineState,
  loadOfflineState,
  saveDevice,
  setOfflineState,
  useOfflineStore,
} from "./store";
import { registerTillServiceWorker } from "./serviceWorker";
import { startSyncLoop, syncNow } from "./sync";
import { offlineTransport, onlineTransport } from "./transport";

/** Why offline selling is not available on this device, or null when it is. */
function unavailableReason(state: ReturnType<typeof useOfflineStore>): string | null {
  if (!state.loaded) return "Memuat data perangkat…";
  if (!state.device) return "Perangkat ini belum didaftarkan untuk metode offline";
  if (state.deviceRejected) return state.deviceRejected;
  if (!snapshotReady(state.snapshot)) return "Data offline belum diunduh — buka kasir sekali saat online";
  if (!state.shift) return "Shift belum terbaca — buka kasir sekali saat online";
  return null;
}

export function useOfflineTill() {
  const { user, session } = useAuth();
  const { can } = usePermissions();
  const connectivity = useConnectivity();
  const state = useOfflineStore();
  const tenantId = user?.tenantId ?? null;

  useEffect(() => startConnectivityWatch(), []);
  useEffect(() => registerTillServiceWorker(), []);
  useEffect(() => startSyncLoop(), []);

  useEffect(() => {
    if (!tenantId) return;
    void loadOfflineState(tenantId).then(() => {
      /* A reload with no connection still opens the payment dialog with the
         branch's channels — from the copy the last snapshot left. */
      const settings = getOfflineState().snapshot.settings;
      if (settings) seedTillChannels(settings.branch._id, settings.channels);
      return refreshCounts();
    });
  }, [tenantId]);

  /*
    WHILE ONLINE, KEEP THE COPY CURRENT: once when the device is known, and
    again every time the connection comes back — the first thing a till that
    has been offline does is send its sales and re-read the shelves.
  */
  const deviceId = state.device?.deviceId ?? null;
  useEffect(() => {
    if (!deviceId || connectivity.offline) return;
    void (async () => {
      await syncNow();
      await refreshSnapshot();
    })();
  }, [deviceId, connectivity.offline]);

  const reason = unavailableReason(state);
  const available = reason === null;
  const selling: "online" | "offline" = connectivity.offline && available ? "offline" : "online";

  const context = useMemo(
    () =>
      user && tenantId
        ? {
            tenantId,
            userId: user._id,
            userName: user.fullName ?? null,
            maySetPrice: can("posTransactions", "setPrice"),
          }
        : null,
    [user, tenantId, can],
  );

  const local = useMemo(() => (context ? offlineTransport(context) : null), [context]);

  /*
    WHICH WAY A CART WRITE GOES — see `CartTransportChoice`. A basket that
    already lives on the device stays there until it is paid.
  */
  const transports = useMemo<CartTransportChoice>(
    () => ({
      pick: (cart) =>
        local && (isLocalId(cart?._id) || selling === "offline") ? local : onlineTransport,
      fallback: () => (local && available ? local : null),
    }),
    [local, selling, available],
  );

  const register = useCallback(
    async (name: string | null) => {
      if (!tenantId) throw new Error("Belum masuk");
      const created = await posOfflineService.registerDevice({
        branchId: session?.currentBranchId ?? undefined,
        name,
      });
      await saveDevice({
        tenantId,
        deviceId: created._id,
        secret: created.secret,
        code: created.code,
        name: created.name,
        branchId: created.branchId,
        branchCode: created.branchCode,
        registeredAt: new Date().toISOString(),
      });
      await refreshSnapshot();
      return created;
    },
    [tenantId, session?.currentBranchId],
  );

  /** Checks the stored registration with the server; forgets one it refuses. */
  const verify = useCallback(async () => {
    const device = state.device;
    if (!device || !tenantId) return;
    try {
      const fresh = await posOfflineService.currentDevice(device);
      setOfflineState({ deviceRejected: null });
      if (fresh.name !== device.name) await saveDevice({ ...device, name: fresh.name });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setOfflineState({ deviceRejected: error.message });
      }
    }
  }, [state.device, tenantId]);

  const unregister = useCallback(async () => {
    if (tenantId) await forgetDevice(tenantId);
  }, [tenantId]);

  return {
    connectivity,
    state,
    selling,
    available,
    unavailableReason: reason,
    transports,
    local,
    register,
    verify,
    unregister,
    syncNow,
    refreshSnapshot,
  };
}

export type OfflineTill = ReturnType<typeof useOfflineTill>;
