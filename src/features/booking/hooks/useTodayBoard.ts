"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Booking } from "@/types/api";

import { listAllBookings } from "../listAll";
import { toTodayRows, type TodayRow } from "../today";

interface Loaded {
  key: string;
  bookings: Booking[];
  truncated: boolean;
  failed: boolean;
}

const NOTHING: Loaded = { key: "", bookings: [], truncated: false, failed: false };

export interface TodayBoardState {
  /** Every booking in the visible range, as rows. */
  rows: TodayRow[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  /**
   * Puts a booking a panel control just got back from the server into the
   * board, instead of re-reading a month to learn one status.
   */
  replaceBooking: (booking: Booking) => void;
}

/**
 * What Hari Ini has loaded — one read per visible range.
 *
 * THE RANGE IS THE VIEW'S, not the day's: the weekly view reads seven days and
 * the monthly one reads its six weeks, so stepping between days inside a week
 * that is already loaded asks the server nothing.
 *
 * RESULTS ARE KEYED rather than cleared on every change, so the board keeps its
 * cards (dimmed) while the next range loads, and a slow answer for last week
 * cannot land on top of this one.
 */
export function useTodayBoard(
  branchId: string,
  from: string,
  to: string,
): TodayBoardState {
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);
  const key = [branchId, from, to].join("|");

  useEffect(() => {
    let active = true;

    listAllBookings({
      branchId: branchId || undefined,
      scheduledFrom: from,
      scheduledTo: to,
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
  }, [key, branchId, from, to]);

  const replaceBooking = useCallback((updated: Booking) => {
    setLoaded((prev) =>
      prev.bookings.some((booking) => booking._id === updated._id)
        ? {
            ...prev,
            bookings: prev.bookings.map((booking) =>
              booking._id === updated._id ? updated : booking,
            ),
          }
        : prev,
    );
  }, []);

  const rows = useMemo(() => toTodayRows(loaded.bookings), [loaded.bookings]);
  const current = loaded.key === key;

  return {
    rows,
    loading: !current,
    error:
      current && loaded.failed
        ? "Jadwal tidak bisa dimuat. Coba muat ulang halaman."
        : null,
    truncated: current && loaded.truncated,
    replaceBooking,
  };
}
