"use client";

import { useCallback, useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import { homeTripService } from "@/services/homeTrip.service";
import type { HomeTrip } from "@/types/api";

/**
 * The full trip behind a home booking's `homeTrip` summary — the summary has the
 * trail, but not the next rung's word or who is named as performer.
 *
 * Re-reads itself when the booking's own summary status moves, so a change made
 * from the board or by the booking's other card is picked up; `refresh()` is the
 * doorbell after this screen's own writes. Best effort: a failed read leaves the
 * card drawing from the booking's summary alone.
 */
export function useHomeTrip(tripId: string | null | undefined, summaryStatus?: string) {
  const [trip, setTrip] = useState<HomeTrip | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tripId) return;

    let active = true;

    homeTripService
      .get(tripId)
      .then((found) => {
        if (active) setTrip(found);
      })
      .catch(() => {
        if (active) setTrip(null);
      });

    return () => {
      active = false;
    };
  }, [tripId, summaryStatus, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  /* A trip read for another booking must not leak across a route change. */
  return { trip: tripId && trip?._id === tripId ? trip : null, setTrip, refresh };
}

export interface PerformerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Who may drive a visit — groomers AND drivers on the day, merged and de-duped.
 * Only read when `enabled`, i.e. for somebody who may actually choose.
 */
export function useTripPerformers(date: string | null, enabled: boolean) {
  const [options, setOptions] = useState<PerformerOption[]>([]);

  useEffect(() => {
    if (!enabled || !date) return;

    let active = true;

    Promise.allSettled([
      bookingService.availability(date, "groomer"),
      bookingService.availability(date, "driver"),
    ]).then((results) => {
      if (!active) return;

      const seen = new Set<string>();
      const merged: PerformerOption[] = [];

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const row of result.value) {
          if (seen.has(row._id)) continue;
          seen.add(row._id);
          merged.push({
            value: row._id,
            label: row.offReason ? `${row.fullName} — ${row.offReason}` : row.fullName,
            disabled: Boolean(row.offReason),
          });
        }
      }

      setOptions(merged);
    });

    return () => {
      active = false;
    };
  }, [date, enabled]);

  return options;
}
