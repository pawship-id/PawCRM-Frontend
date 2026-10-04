"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import type { ServiceBookingCountScope } from "@/types/api";

interface Loaded {
  key: string;
  counts: Record<string, number> | null;
  failed: boolean;
}

/**
 * "N booking" for each service on the screen — ONE request for the whole page.
 *
 * `enabled` IS `bookings:read`. The figure is booking data, and a role without
 * that grant is asked nothing rather than collecting a 403 for a number it
 * would not be shown.
 *
 * `scope` IS THE CATALOGUE'S CABANG AND PERIODE. Left out — as the detail page
 * leaves it — the count is all-time, across every branch.
 *
 * NULL WHILE UNKNOWN, so a row prints nothing rather than a zero that is not
 * true yet.
 */
export function useServiceBookingCounts(
  serviceIds: string[],
  enabled: boolean,
  scope?: ServiceBookingCountScope,
) {
  const key =
    enabled && serviceIds.length > 0
      ? JSON.stringify([
          [...serviceIds].sort(),
          scope
            ? [scope.branchId ?? "", scope.scheduledFrom ?? "", scope.scheduledTo ?? ""]
            : null,
        ])
      : "";
  const [loaded, setLoaded] = useState<Loaded>({
    key: "",
    counts: null,
    failed: false,
  });

  useEffect(() => {
    if (key === "") return;

    let active = true;
    const [ids, bounds] = JSON.parse(key) as [string[], [string, string, string] | null];

    const request = bounds
      ? bookingService.serviceCounts(ids, {
          branchId: bounds[0] || undefined,
          scheduledFrom: bounds[1] || undefined,
          scheduledTo: bounds[2] || undefined,
        })
      : bookingService.serviceCounts(ids);

    request
      .then((result) => {
        if (active) setLoaded({ key, counts: result.counts, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, counts: null, failed: true });
      });

    return () => {
      active = false;
    };
  }, [key]);

  const current = key !== "" && loaded.key === key;

  return {
    counts: current ? loaded.counts : null,
    loading: key !== "" && !current,
    failed: current && loaded.failed,
  };
}
