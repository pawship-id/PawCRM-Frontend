import { useCallback, useSyncExternalStore } from "react";

import { zoneService } from "@/services/zone.service";

import type { DistanceSource } from "./zoneDistance";

/**
 * THE SERVER'S ROAD DISTANCES, REMEMBERED IN THE BROWSER (11 October 2026).
 *
 * Every zone price is a band of the distance actually driven, measured by the
 * server (Google Routes, or the crow's line when it cannot). A form's preview
 * asks for the same number here, so "Zona B · 3,9 km" on screen is what the
 * line will store.
 *
 * ASKED IN BATCHES: a basket holding a grooming at home and two rides asks
 * three pairs in one request. Answered pairs are kept for the session; a pair
 * whose request failed is simply asked again next time.
 */

type Point = { lat: number; lng: number };
/** Any pin the forms hold — a field may be null before it is filled in. */
type LoosePoint = { lat?: number | null; lng?: number | null } | null | undefined;
export type Measured = { km: number; source: DistanceSource };

const BATCH_LIMIT = 20;
const cache = new Map<string, Measured>();
const queued = new Map<string, { from: Point; to: Point }>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const hasPin = (point: LoosePoint): point is Point =>
  typeof point?.lat === "number" && typeof point?.lng === "number";

const keyOf = (from: Point, to: Point) =>
  `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

async function flush() {
  timer = null;
  const batch = [...queued.entries()].slice(0, BATCH_LIMIT);
  batch.forEach(([key]) => {
    queued.delete(key);
    inFlight.add(key);
  });
  if (queued.size > 0) timer = setTimeout(flush, 0);
  if (batch.length === 0) return;

  try {
    const answers = await Promise.resolve(zoneService.measure(batch.map(([, pair]) => pair)));

    (answers ?? []).forEach((answer, index) => {
      const key = batch[index]?.[0];
      if (key && typeof answer?.distanceKm === "number") {
        cache.set(key, { km: answer.distanceKm, source: answer.source });
      }
    });
    notify();
  } catch {
    /* Nothing to remember — the crow's line keeps standing in. */
  } finally {
    batch.forEach(([key]) => inFlight.delete(key));
  }
}

/** The remembered road distance for a pair, or null — asking for it if need be. */
export function roadDistanceOf(from: LoosePoint, to: LoosePoint): Measured | null {
  if (!hasPin(from) || !hasPin(to)) return null;

  const key = keyOf(from, to);
  const hit = cache.get(key);
  if (hit) return hit;

  if (!queued.has(key) && !inFlight.has(key)) {
    queued.set(key, { from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng } });
    if (!timer) timer = setTimeout(flush, 30);
  }

  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `measured(from, to)` — the road distance once the server has answered, null
 * until then — and a re-render when any answer lands.
 */
export function useRoadDistance() {
  const tick = useSyncExternalStore(subscribe, () => version, () => version);

  /* A new function per answer, so a memo depending on it reads the new cache. */
  return useCallback(
    (from: LoosePoint, to: LoosePoint) => (tick >= 0 ? roadDistanceOf(from, to) : null),
    [tick],
  );
}

/** Test seam — forget every remembered distance. */
export function clearRoadDistances() {
  cache.clear();
  queued.clear();
  inFlight.clear();
}
