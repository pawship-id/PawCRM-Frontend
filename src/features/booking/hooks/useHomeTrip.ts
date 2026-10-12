"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";

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
