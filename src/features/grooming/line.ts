import type { BusinessLine } from "@/services/businessLine.service";
import type { ServiceFormOrigin } from "@/features/services/formOrigin";
import { SETTINGS_PATHS, serviceFormPath } from "@/features/settings/paths";
import type { ServiceKind } from "@/types/api";

import {
  GROOMING_CATALOG_PATH,
  GROOMING_NEW_BOOKING_PATH,
  GROOMING_PATH,
  GROOMING_SETTINGS_PATH,
} from "./paths";

/**
 * ONE LINE OF BUSINESS'S MODULE — Layanan › Grooming, Layanan › Antar-Jemput.
 *
 * The Grooming screens were built for one line (13 September 2026). Antar-Jemput
 * is "persis grooming" by BO's own words (21 September 2026): the same three
 * tabs, the same Layanan & Harga table, the same service page with its Varian &
 * Harga and Tahapan & Add-on editors. So those screens take a line instead of
 * a second copy being made of each — what differs is WHICH line they read, what
 * they are called, and where their links go. This is that difference, whole.
 *
 * The BOOKING tab is not shared: a ride's table has columns a bath does not
 * (Arah & Alamat, Driver), so each line keeps its own board over the same
 * arithmetic (`board.ts`).
 */
export interface ServiceLine {
  /**
   * WHAT THIS MODULE SELLS (22 September 2026) — which Opsi Varian cards its
   * services are offered. Fixed words, not the tenant's line names.
   */
  serviceKind: ServiceKind;
  /** "Grooming" — the title and the crumb. */
  title: string;
  /** In a sentence: "Belum ada layanan grooming." */
  noun: string;
  /** The line's name as a booking snapshots it, when the list cannot be read. */
  fallbackName: string;
  /** The tenant's line for this module, found by name — a line is a free label. */
  pick: (lines: BusinessLine[]) => BusinessLine | null;
  paths: {
    root: string;
    catalog: string;
    settings: string;
    newBooking: string;
  };
}

/** The first line named exactly one of `names`, else the first containing a fragment. */
export function pickLineByName(
  lines: BusinessLine[],
  names: string[],
  fragments: string[],
): BusinessLine | null {
  const named = (line: BusinessLine) =>
    line.name.trim().toLowerCase().replace(/[\s_-]+/g, " ");

  return (
    lines.find((line) => names.includes(named(line))) ??
    lines.find((line) => fragments.some((fragment) => named(line).includes(fragment))) ??
    null
  );
}

export const GROOMING_LINE: ServiceLine = {
  serviceKind: "grooming",
  title: "Grooming",
  noun: "grooming",
  fallbackName: "Grooming",
  pick: (lines) => pickLineByName(lines, ["grooming"], ["groom"]),
  paths: {
    root: GROOMING_PATH,
    catalog: GROOMING_CATALOG_PATH,
    settings: GROOMING_SETTINGS_PATH,
    newBooking: GROOMING_NEW_BOOKING_PATH,
  },
};

/** One service's page, under its line's Layanan & Harga tab. */
export function lineServicePath(line: ServiceLine, serviceId: string): string {
  return `${line.paths.catalog}/${serviceId}`;
}

/**
 * What the service form is told when opened from this module — the Kelompok
 * layanan a new service starts on, and the list a save returns to. Carried by
 * `ServiceFormLink`, never in the URL.
 */
export function lineFormOrigin(line: ServiceLine): ServiceFormOrigin {
  return { serviceKind: line.serviceKind, listPath: line.paths.catalog };
}

/** The service form — the same plain address from every module. */
export const NEW_MAIN_SERVICE_PATH = SETTINGS_PATHS.layananBaru;

export function lineServiceEditPath(serviceId: string): string {
  return serviceFormPath(serviceId);
}
