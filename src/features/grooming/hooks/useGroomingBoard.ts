"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { bookingService } from "@/services/booking.service";
import type { Booking, BookingListQuery } from "@/types/api";

import {
  isoDate,
  toGroomingRows,
  type DateRange,
  type GroomingRow,
  type GroomingScope,
} from "../board";

/** The API's page cap. */
const PAGE_LIMIT = 100;

/**
 * 2.000 bookings in one period. Past that the screen says the numbers are
 * partial rather than quietly summing the first pages.
 */
export const MAX_BOOKING_PAGES = 20;

interface Loaded {
  key: string;
  bookings: Booking[];
  truncated: boolean;
  failed: boolean;
}

const NOTHING: Loaded = { key: "", bookings: [], truncated: false, failed: false };

async function listAll(
  query: BookingListQuery,
): Promise<{ bookings: Booking[]; truncated: boolean }> {
  const first = await bookingService.list({ ...query, page: 1, limit: PAGE_LIMIT });
  const pages = Math.min(first.pagination.totalPages, MAX_BOOKING_PAGES);

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      bookingService.list({ ...query, page: index + 2, limit: PAGE_LIMIT }),
    ),
  );

  /*
    DEDUPED BY ID. A booking made while the pages are in flight shifts every
    later page by one, and the row on the boundary would otherwise be counted
    twice on the cards.
  */
  const seen = new Map<string, Booking>();
  for (const result of [first, ...rest]) {
    for (const booking of result.items) seen.set(booking._id, booking);
  }

  return {
    bookings: [...seen.values()],
    truncated: first.pagination.totalPages > MAX_BOOKING_PAGES,
  };
}

export interface GroomingBoardState {
  /** The chosen period, grooming rows only. */
  periodRows: GroomingRow[];
  /** Today, whatever the period — the "Sedang dikerjakan" card reads this. */
  todayRows: GroomingRow[];
  loading: boolean;
  todayLoading: boolean;
  error: string | null;
  todayError: boolean;
  truncated: boolean;
  /**
   * Puts a booking a row control just got back from the server into both
   * lists, instead of re-reading a month of bookings to learn one status.
   */
  replaceBooking: (booking: Booking) => void;
}

/**
 * The board's two reads: the period, and today.
 *
 * TODAY IS ITS OWN FETCH because "sedang dikerjakan bulan lalu" is not a number
 * with a meaning — the card follows the branch and the panel's filters, and
 * ignores the period.
 *
 * RESULTS ARE KEYED rather than cleared on every change, so the table keeps its
 * rows (dimmed) while the next period loads, and a slow answer for last week
 * cannot land on top of this month's.
 */
export function useGroomingBoard(
  scope: GroomingScope | null,
  branchId: string,
  range: DateRange,
): GroomingBoardState {
  const [today] = useState(() => isoDate(new Date()));
  const [period, setPeriod] = useState<Loaded>(NOTHING);
  const [day, setDay] = useState<Loaded>(NOTHING);

  const periodKey = [branchId, range.from, range.to].join("|");
  const dayKey = [branchId, today].join("|");

  useEffect(() => {
    let active = true;

    listAll({
      branchId: branchId || undefined,
      scheduledFrom: range.from || undefined,
      scheduledTo: range.to || undefined,
    })
      .then((result) => {
        if (active) setPeriod({ key: periodKey, ...result, failed: false });
      })
      .catch(() => {
        if (active) setPeriod({ ...NOTHING, key: periodKey, failed: true });
      });

    return () => {
      active = false;
    };
  }, [periodKey, branchId, range.from, range.to]);

  useEffect(() => {
    let active = true;

    listAll({
      branchId: branchId || undefined,
      scheduledFrom: today,
      scheduledTo: today,
    })
      .then((result) => {
        if (active) setDay({ key: dayKey, ...result, failed: false });
      })
      .catch(() => {
        if (active) setDay({ ...NOTHING, key: dayKey, failed: true });
      });

    return () => {
      active = false;
    };
  }, [dayKey, branchId, today]);

  const replaceBooking = useCallback((updated: Booking) => {
    const swap = (loaded: Loaded): Loaded =>
      loaded.bookings.some((booking) => booking._id === updated._id)
        ? {
            ...loaded,
            bookings: loaded.bookings.map((booking) =>
              booking._id === updated._id ? updated : booking,
            ),
          }
        : loaded;

    setPeriod(swap);
    setDay(swap);
  }, []);

  const periodRows = useMemo(
    () => (scope ? toGroomingRows(period.bookings, scope) : []),
    [scope, period.bookings],
  );
  const todayRows = useMemo(
    () => (scope ? toGroomingRows(day.bookings, scope) : []),
    [scope, day.bookings],
  );

  const periodCurrent = period.key === periodKey;
  const dayCurrent = day.key === dayKey;

  return {
    periodRows,
    todayRows,
    loading: scope === null || !periodCurrent,
    todayLoading: scope === null || !dayCurrent,
    error:
      periodCurrent && period.failed
        ? "Booking grooming tidak bisa dimuat. Coba muat ulang halaman."
        : null,
    todayError: dayCurrent && day.failed,
    truncated: periodCurrent && period.truncated,
    replaceBooking,
  };
}
