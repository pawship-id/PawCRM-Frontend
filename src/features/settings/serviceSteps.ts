import type { ServiceStep } from "@/types/api";

import { SERVICE_SETTINGS_PATH } from "./petOptions";

/**
 * Pengaturan › Layanan › Tahapan — the path, cap and ordering rule the screen,
 * its hub card and the grooming settings card share.
 */

/** A section of the hub since 17 September 2026 — `/tahapan` redirects here. */
export const SERVICE_STEPS_PATH = `${SERVICE_SETTINGS_PATH}?bagian=tahapan`;

/**
 * Backend cap — NAME_MAX_LENGTH in serviceStep.model.js, which is the booking
 * turn's own cap: a longer step would be cut on every booking made from it.
 */
export const SERVICE_STEP_NAME_MAX_LENGTH = 60;

/** Backend cap — HOTEL_TIME_MAX_LENGTH in serviceStep.model.js. */
export const HOTEL_TIME_MAX_LENGTH = 40;

/** Backend cap — NOTE_MAX_LENGTH in serviceStep.model.js. */
export const STEP_NOTE_MAX_LENGTH = 500;

/** Backend cap — MAX_ESTIMATE_MINUTES in serviceStep.model.js (a day). */
export const MAX_ESTIMATE_MINUTES = 1440;

/** "15 menit", "1 jam 30 menit" — or null when not filled in. */
export function formatEstimate(minutes: number | null | undefined) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} menit`;
}

/** The order every picker uses — the same rule as `useServiceSteps`. */
export function byStepOrder(a: ServiceStep, b: ServiceStep) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id");
}

/** The name as the server stores it: trimmed, inner spaces collapsed. */
export function stepNameOf(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}
