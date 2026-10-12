"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";

import type { DateRange, GroomingScope } from "../board";

interface Loaded {
  key: string;
  firstBookingIds: ReadonlySet<string> | null;
  failed: boolean;
}

const NOTHING: Loaded = { key: "", firstBookingIds: null, failed: false };

/**
 * The ids of each animal's FIRST grooming booking, for the animals booked in
 * this cabang and period — what the "Hewan baru" card is counted from.
 *
 * ITS OWN READ, not part of the board's: the answer lies in history the board
 * never loads. Keyed like `useGroomingBoard`, so a slow answer for last week
 * cannot land on top of this month's.
 *
 * NULL WHILE UNKNOWN, so the card prints "—" rather than a zero that is not
 * true yet.
 */
export function useFirstVisits(
  scope: GroomingScope | null,
  branchIds: string[],
  range: DateRange,
) {
  const key = scope
    ? JSON.stringify([
        [...scope.serviceIds].sort(),
        scope.lineName,
        branchIds.join(","),
        range.from,
        range.to,
      ])
    : "";
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);

  useEffect(() => {
    if (key === "") return;

    let active = true;
    const [serviceIds, serviceType, branches, from, to] = JSON.parse(key) as [
      string[],
      string,
      string,
      string,
      string,
    ];

    bookingService
      .firstVisits({
        serviceIds,
        serviceType,
        branchIds: branches ? branches.split(",") : undefined,
        scheduledFrom: from || undefined,
        scheduledTo: to || undefined,
      })
      .then((result) => {
        if (!active) return;
        setLoaded({
          key,
          firstBookingIds: new Set(result.firsts.map((first) => first.bookingId)),
          failed: false,
        });
      })
      .catch(() => {
        if (active) setLoaded({ key, firstBookingIds: null, failed: true });
      });

    return () => {
      active = false;
    };
  }, [key]);

  const current = key !== "" && loaded.key === key;

  return {
    firstBookingIds: current ? loaded.firstBookingIds : null,
    loading: !current,
    failed: current && loaded.failed,
  };
}
