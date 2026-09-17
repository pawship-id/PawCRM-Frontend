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

/** The order every picker uses — the same rule as `useServiceSteps`. */
export function byStepOrder(a: ServiceStep, b: ServiceStep) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id");
}

/** The name as the server stores it: trimmed, inner spaces collapsed. */
export function stepNameOf(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}
