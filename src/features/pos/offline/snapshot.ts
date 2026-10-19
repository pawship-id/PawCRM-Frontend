/**
 * KEEPING THE DEVICE'S COPY CURRENT (POS offline mode, 19 October 2026).
 *
 * The server sends only the sections whose version changed, so a refresh is
 * cheap enough to run every few minutes on a weak connection: usually just the
 * settings and the stock, a few kilobytes. The catalogue and the customers come
 * down again only when somebody changed them.
 */
import { posOfflineService } from "@/services/posOffline.service";
import { seedTillChannels } from "../hooks/tillChannels";

import { raiseCounter } from "./numbering";
import { getOfflineState, saveSnapshot, setOfflineState, type OfflineSnapshot } from "./store";

let inFlight: Promise<OfflineSnapshot | null> | null = null;

export async function refreshSnapshot(): Promise<OfflineSnapshot | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { device, snapshot } = getOfflineState();
    if (!device) return null;

    const sentAt = Date.now();
    try {
      const response = await posOfflineService.snapshot(device, {
        catalog: snapshot.catalog ? snapshot.versions.catalog : undefined,
        stock: snapshot.stock ? snapshot.versions.stock : undefined,
        customers: snapshot.customers ? snapshot.versions.customers : undefined,
      });
      const receivedAt = Date.now();
      const serverMs = new Date(response.serverTime).getTime();

      const next: OfflineSnapshot = {
        settings: response.settings,
        catalog: response.catalog ?? snapshot.catalog,
        stock: response.stock ?? snapshot.stock,
        customers: response.customers ?? snapshot.customers,
        versions: response.versions,
        fetchedAt: new Date(receivedAt).toISOString(),
        // Half the round trip is the best guess at when the server read its clock.
        clockOffsetMs: Number.isFinite(serverMs)
          ? Math.round(serverMs - (sentAt + receivedAt) / 2)
          : snapshot.clockOffsetMs,
      };

      await saveSnapshot(next);
      seedTillChannels(response.settings.branch._id, response.settings.channels);

      // The device never issues a number the server has already recorded.
      const { scope, lastSequence } = response.settings.numbering;
      if (lastSequence > 0) await raiseCounter(scope, lastSequence);

      setOfflineState({ deviceRejected: null });
      return next;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 403) {
        setOfflineState({
          deviceRejected:
            (error as { reason?: string; message?: string }).message ??
            "Perangkat kasir ini tidak dikenali server",
        });
      }
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** True when the device holds enough to ring up a sale with nobody to ask. */
export function snapshotReady(snapshot: OfflineSnapshot): boolean {
  return Boolean(
    snapshot.settings &&
      snapshot.catalog &&
      snapshot.stock &&
      snapshot.customers &&
      // Read with no shift open, the catalogue has no warehouse to price stock at.
      snapshot.stock.warehouseId,
  );
}
