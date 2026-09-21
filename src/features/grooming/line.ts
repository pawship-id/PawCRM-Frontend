import type { BusinessLine } from "@/services/businessLine.service";

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
   * `?dari=` on the service form, so a save lands back on this line's list.
   * Null for Grooming, the form's own default.
   */
  formOrigin: string | null;
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
  formOrigin: null,
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

/** The service form, told which list to come back to. */
export function lineServiceEditPath(line: ServiceLine, serviceId: string): string {
  const base = `/dashboard/master/layanan/${serviceId}`;
  return line.formOrigin ? `${base}?dari=${line.formOrigin}` : base;
}

/**
 * A new MAIN service for this line — its line already chosen when the tenant
 * has one, and the save coming back to this list.
 */
export function lineNewServicePath(line: ServiceLine, lineId: string | null): string {
  const query = new URLSearchParams({ jenis: "utama" });
  if (lineId) query.set("lini", lineId);
  if (line.formOrigin) query.set("dari", line.formOrigin);
  return `/dashboard/master/layanan/new?${query.toString()}`;
}
