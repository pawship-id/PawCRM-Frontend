import type { Zone } from "@/types/api";

/**
 * Pengaturan › Layanan › Zona — the rules the screen and its dialog share, the
 * same ones the server enforces (zone.model.js).
 */

/** Backend caps — zone.model.js. */
export const ZONE_NAME_MAX_LENGTH = 60;
export const ZONE_DESCRIPTION_MAX_LENGTH = 500;
export const MAX_DISTANCE_KM = 1000;

/**
 * What was typed → km, or null when it is not a distance the server takes:
 * 0–1000, at most three decimals. A comma is read as the decimal point — "2,5"
 * is how two and a half is written here.
 */
export function kmValue(text: string): number | null {
  const compact = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(compact)) return null;

  const km = Number(compact);
  return km <= MAX_DISTANCE_KM ? km : null;
}

/** 2.5 → "2,5" — how a distance is read back. */
export function kmText(km: number): string {
  return String(km).replace(".", ",");
}

/** "1–3 km" */
export function zoneRangeText(zone: Pick<Zone, "minKm" | "maxKm">): string {
  return `${kmText(zone.minKm)}–${kmText(zone.maxKm)} km`;
}

/**
 * Whether `[aMin, aMax)` and `[bMin, bMax)` share any distance. Touching ends
 * do not: "1–3" and "3–5" are neighbours.
 */
export function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  return aMin < bMax && bMin < aMax;
}
