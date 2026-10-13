"use client";

import { useMemo } from "react";

import { toTodayRows, type TodayRow } from "@/features/booking";
import { listAllBookings } from "@/features/booking/listAll";

import { useRemote } from "./useRemote";

/**
 * Every booking scheduled in a range, as the day board's rows — the same
 * `listAllBookings` + `toTodayRows` Kalender reads, so a count here can never
 * disagree with the cards there.
 *
 * Empty dates are an open end; both empty is every date, which the cap in
 * `listAllBookings` bounds and `truncated` reports.
 */
export function useBookingsIn(
  branchIds: string[],
  dateFrom: string,
  dateTo: string,
  enabled: boolean,
): { rows: TodayRow[]; loading: boolean; failed: boolean; truncated: boolean } {
  const remote = useRemote(
    ["bookings", branchIds.join(","), dateFrom, dateTo].join("|"),
    () =>
      listAllBookings({
        branchIds: branchIds.length > 0 ? branchIds : undefined,
        scheduledFrom: dateFrom || undefined,
        scheduledTo: dateTo || undefined,
      }),
    enabled,
  );

  const rows = useMemo(
    () => toTodayRows(remote.data?.bookings ?? []),
    [remote.data],
  );

  return {
    rows,
    loading: remote.loading,
    failed: remote.failed,
    truncated: remote.data?.truncated ?? false,
  };
}

/** Rungs where nobody has finished with the animal yet. */
export const OPEN_STATUSES = new Set([
  "draft",
  "requested",
  "confirmed",
  "pickup",
  "arrived",
  "in_progress",
]);

/** Rungs where the work itself is done. */
export const DONE_STATUSES = new Set([
  "completed",
  "delivery",
  "return_to_pawrents",
]);
