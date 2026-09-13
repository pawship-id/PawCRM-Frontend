"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";

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
 * NULL WHILE UNKNOWN, so a row prints nothing rather than a zero that is not
 * true yet.
 */
export function useServiceBookingCounts(serviceIds: string[], enabled: boolean) {
  const key =
    enabled && serviceIds.length > 0 ? [...serviceIds].sort().join(",") : "";
  const [loaded, setLoaded] = useState<Loaded>({
    key: "",
    counts: null,
    failed: false,
  });

  useEffect(() => {
    if (key === "") return;

    let active = true;

    bookingService
      .serviceCounts(key.split(","))
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
