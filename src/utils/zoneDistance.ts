import type { GeoLocation, Zone } from "@/types/api";

/**
 * The client's mirror of the server's utils/zoneDistance.js — which zone a
 * customer falls in, seen from a branch. A PREVIEW for the form's price; the
 * server measures again and is what the line stores.
 */

const EARTH_RADIUS_KM = 6371.0088;

type Pin = Pick<GeoLocation, "lat" | "lng"> | null | undefined;

const hasPin = (pin: Pin): pin is { lat: number; lng: number } =>
  typeof pin?.lat === "number" && typeof pin?.lng === "number";

export function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type ZoneLookup =
  | { ok: true; zone: Zone; distanceKm: number }
  | { ok: false; reason: "customer_location_missing" | "branch_location_missing" }
  | { ok: false; reason: "outside_zones"; distanceKm: number };

/** The live zone whose [minKm, maxKm) holds the rounded distance, or why none does. */
export function resolveZone(branchPin: Pin, customerPin: Pin, zones: readonly Zone[]): ZoneLookup {
  if (!hasPin(customerPin)) return { ok: false, reason: "customer_location_missing" };
  if (!hasPin(branchPin)) return { ok: false, reason: "branch_location_missing" };

  const distanceKm = Math.round(haversineKm(branchPin, customerPin) * 1000) / 1000;
  const zone = zones.find(
    (candidate) =>
      candidate.deletedAt === null && distanceKm >= candidate.minKm && distanceKm < candidate.maxKm,
  );

  return zone ? { ok: true, zone, distanceKm } : { ok: false, reason: "outside_zones", distanceKm };
}

/** How a failure is said to somebody at the counter — the server's words. */
export const ZONE_FAILURE_MESSAGE = {
  customer_location_missing: "Koordinat alamat pelanggan belum diisi",
  branch_location_missing: "Koordinat cabang belum diisi",
  outside_zones: "Jarak pelanggan di luar semua zona",
} as const;
