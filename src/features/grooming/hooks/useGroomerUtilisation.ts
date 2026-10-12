"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";

import { isoDate, type DateRange } from "../board";

/** The most days one Ringkasan asks capacity for — one request per day. */
export const UTILISATION_MAX_DAYS = 31;

export interface Utilisation {
  /** Booked minutes over the days counted. */
  usedMin: number;
  /** What the groomers on duty could take over the same days. */
  capacityMin: number;
  /** Groomers on duty on at least one of those days. */
  groomers: number;
  /** Groomers the tenant has, on duty or not. */
  allGroomers: number;
  /** Whole percent; null when nobody was on duty. */
  percent: number | null;
}

/** The days of `range` up to today, or null when that is not a usable span. */
export function utilisationDays(range: DateRange, today: Date): string[] | null {
  if (!range.from || !range.to) return null;

  const days: string[] = [];
  const end = isoDate(today) < range.to ? isoDate(today) : range.to;
  const [y, m, d] = range.from.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);

  while (isoDate(cursor) <= end) {
    days.push(isoDate(cursor));
    if (days.length > UTILISATION_MAX_DAYS) return null;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length ? days : null;
}

/**
 * UTILISASI GROOMER — booked minutes over what the groomers on duty could
 * take, summed over the period's days up to today, read from the same
 * `GET /bookings/capacity` the Pengaturan › Kapasitas screen draws.
 *
 * DAYS ALREADY LIVED ONLY: a future day's capacity is mostly empty because it
 * has not been booked yet, which would read as idle groomers.
 *
 * ONE REQUEST PER DAY, so the span is capped at `UTILISATION_MAX_DAYS`; past
 * that, or on "Semua", the card says why instead of a number. Capacity is per
 * groomer, not per cabang — the endpoint takes no branch.
 */
export function useGroomerUtilisation(range: DateRange, today: Date) {
  const days = utilisationDays(range, today);
  const key = days ? days.join(",") : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    value: Utilisation | null;
    failed: boolean;
  }>({ key: "", value: null, failed: false });

  useEffect(() => {
    if (key === "") return;
    let active = true;

    Promise.all(key.split(",").map((day) => bookingService.capacity(day)))
      .then((results) => {
        if (!active) return;
        let usedMin = 0;
        let capacityMin = 0;
        const onDuty = new Set<string>();
        const all = new Set<string>();
        for (const day of results) {
          for (const groomer of day.groomers) {
            all.add(groomer._id);
            if (groomer.offReason) continue;
            onDuty.add(groomer._id);
            usedMin += groomer.usedMin;
            capacityMin += groomer.capacityMin;
          }
        }
        setLoaded({
          key,
          failed: false,
          value: {
            usedMin,
            capacityMin,
            groomers: onDuty.size,
            allGroomers: all.size,
            percent: capacityMin
              ? Math.round((usedMin / capacityMin) * 100)
              : null,
          },
        });
      })
      .catch(() => {
        if (active) setLoaded({ key, value: null, failed: true });
      });

    return () => {
      active = false;
    };
  }, [key]);

  const current = key !== "" && loaded.key === key;
  return {
    /** False when the period cannot be asked about — see the header. */
    available: key !== "",
    value: current ? loaded.value : null,
    loading: key !== "" && !current,
    failed: current && loaded.failed,
  };
}
