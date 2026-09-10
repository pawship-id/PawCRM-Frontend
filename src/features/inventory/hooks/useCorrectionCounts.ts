"use client";

import { useEffect, useState } from "react";

import { stockEntryService } from "@/services/stockEntry.service";
import { stockOpnameService } from "@/services/stockOpname.service";

/** One tile's number: how many there are, and whether we know yet. */
export interface CorrectionCount {
  total: number;
  loading: boolean;
  error: boolean;
}

export interface CorrectionCounts {
  /** Count sheets dated this month, finished or not. */
  opnames: CorrectionCount;
  /** Sheets still open — a count somebody started and has not submitted. */
  drafts: CorrectionCount;
  /** Hand-typed adjustment documents dated this month. */
  adjustments: CorrectionCount;
}

const PENDING: CorrectionCount = { total: 0, loading: true, error: false };
const FAILED: CorrectionCount = { total: 0, loading: false, error: true };
/** Not asked for — the caller holds no grant, so its tile is never rendered. */
const UNGRANTED: CorrectionCount = { total: 0, loading: false, error: false };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The first and last day of the month we are in, as the API's `YYYY-MM-DD`.
 *
 * BUILT FROM LOCAL PARTS, never `toISOString()`. A shop in WIB opening the
 * screen before 07:00 would otherwise send yesterday's date — and on the first
 * of the month, last month's — which is the kind of off-by-one nobody notices
 * until a total is quietly short for seven hours a day.
 */
function thisMonth(now = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  // Day 0 of next month is the last day of this one, leap years included.
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return { from: iso(first), to: iso(last) };
}

/**
 * The three numbers on the Koreksi Stok header.
 *
 * ONE ROW IS FETCHED PER COUNT, NOT THE LIST: `limit: 1` costs a small query and
 * `pagination.total` still reports the true figure — the same trick
 * useLowStockAlert, useRegistryCounts and useCatalogCounts play.
 *
 * BOTH MONTHLY COUNTS ARE BOUNDED AT BOTH ENDS. `dateFrom` alone would also
 * catch a document dated into next month, which is legal on both endpoints (a
 * count sheet carries the day the shelves were walked, and somebody typing 2026
 * instead of 2025 is how it happens).
 *
 * THE DRAFT COUNT IS DELIBERATELY NOT BOUNDED BY DATE. An abandoned count sheet
 * is exactly the thing that goes stale — one opened in August and forgotten is
 * more worth surfacing in September than one opened yesterday, and a monthly
 * window would hide it the moment it started to matter.
 *
 * Each side is gated by its own grant: a role that may read counts but not the
 * ledger gets two tiles rather than a 403 painted across the header.
 */
export function useCorrectionCounts(
  mayReadOpnames: boolean,
  mayReadAdjustments: boolean,
): CorrectionCounts {
  const [opnames, setOpnames] = useState<CorrectionCount>(PENDING);
  const [drafts, setDrafts] = useState<CorrectionCount>(PENDING);
  const [adjustments, setAdjustments] = useState<CorrectionCount>(PENDING);

  useEffect(() => {
    let active = true;
    const { from, to } = thisMonth();

    // The sanctioned fetch-effect shape (see useLowStockAlert).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpnames(mayReadOpnames ? PENDING : UNGRANTED);
    setDrafts(mayReadOpnames ? PENDING : UNGRANTED);
    setAdjustments(mayReadAdjustments ? PENDING : UNGRANTED);

    const fill =
      (set: (next: CorrectionCount) => void) =>
      (result: { pagination: { total: number } }) => {
        if (active)
          set({ total: result.pagination.total, loading: false, error: false });
      };
    const fail = (set: (next: CorrectionCount) => void) => () => {
      if (active) set(FAILED);
    };

    if (mayReadOpnames) {
      stockOpnameService
        .list({ page: 1, limit: 1, dateFrom: from, dateTo: to })
        .then(fill(setOpnames))
        .catch(fail(setOpnames));

      stockOpnameService
        .list({ page: 1, limit: 1, status: "draft" })
        .then(fill(setDrafts))
        .catch(fail(setDrafts));
    }

    if (mayReadAdjustments) {
      stockEntryService
        .list({
          kind: "adjustment",
          page: 1,
          limit: 1,
          dateFrom: from,
          dateTo: to,
        })
        .then(fill(setAdjustments))
        .catch(fail(setAdjustments));
    }

    return () => {
      active = false;
    };
  }, [mayReadOpnames, mayReadAdjustments]);

  return { opnames, drafts, adjustments };
}
