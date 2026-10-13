"use client";

import { useEffect, useMemo, useState } from "react";

import { listAllBookings } from "@/features/booking/listAll";
import type { Booking } from "@/types/api";

import {
  toGroomingRows,
  type DateRange,
  type GroomingRow,
  type GroomingScope,
} from "../board";

interface Loaded {
  key: string;
  bookings: Booking[];
  truncated: boolean;
  failed: boolean;
}

const NOTHING: Loaded = { key: "", bookings: [], truncated: false, failed: false };

/**
 * One range of grooming rows — Ringkasan reads three: the period, the period
 * before it (for "vs periode sebelumnya"), and the history window.
 *
 * The board's own read without the board's extras (today's second fetch, row
 * replacement): Ringkasan only looks. Keyed like `useGroomingBoard`, so a slow
 * answer for an old range cannot land on top of the current one.
 *
 * `range: null` asks nothing — "Semua" has no period before it.
 */
export function useGroomingRows(
  scope: GroomingScope | null,
  branchIds: string[],
  range: DateRange | null,
): {
  rows: GroomingRow[];
  loading: boolean;
  failed: boolean;
  truncated: boolean;
} {
  const branchKey = branchIds.join(",");
  const key = range ? [branchKey, range.from, range.to].join("|") : "";
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);

  useEffect(() => {
    if (key === "") return;
    let active = true;
    const [branches, from, to] = key.split("|");

    listAllBookings({
      branchIds: branches ? branches.split(",") : undefined,
      scheduledFrom: from || undefined,
      scheduledTo: to || undefined,
    })
      .then((result) => {
        if (active) setLoaded({ key, ...result, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ ...NOTHING, key, failed: true });
      });

    return () => {
      active = false;
    };
  }, [key]);

  const current = key !== "" && loaded.key === key;
  const rows = useMemo(
    () => (scope && current ? toGroomingRows(loaded.bookings, scope) : []),
    [scope, current, loaded.bookings],
  );

  return {
    rows,
    loading: key !== "" && (scope === null || !current),
    failed: current && loaded.failed,
    truncated: current && loaded.truncated,
  };
}
