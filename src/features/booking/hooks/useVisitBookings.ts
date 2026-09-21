"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import type { Booking } from "@/types/api";

import { isoDate } from "../day";

/** How far either side of today a visit may be linked — a month back, a season ahead. */
const DAYS_BACK = 30;
const DAYS_AHEAD = 90;

/**
 * A customer's bookings a ride or a booking may be LINKED to — "Tautkan ke
 * booking" (BO's notes 2 and 3, 21 September 2026).
 *
 * THE SAME CUSTOMER ONLY, because the server refuses a visit that is not
 * theirs. Cancelled ones are left out: a visit that will not happen has nothing
 * to be driven to. `excludeId` is the booking doing the linking.
 *
 * Best effort: without `bookings:read` or on a failed read the list is empty,
 * and the field that offers it says so.
 */
export function useVisitBookings(customerId: string | null, excludeId?: string | null) {
  const [state, setState] = useState<{
    key: string;
    items: Booking[];
    failed: boolean;
  }>({ key: "", items: [], failed: false });

  const key = customerId ?? "";

  useEffect(() => {
    if (!customerId) return;

    let active = true;
    const from = new Date();
    from.setDate(from.getDate() - DAYS_BACK);
    const to = new Date();
    to.setDate(to.getDate() + DAYS_AHEAD);

    bookingService
      .list({
        customerId,
        scheduledFrom: isoDate(from),
        scheduledTo: isoDate(to),
        limit: 100,
      })
      .then((result) => {
        if (active) setState({ key: customerId, items: result.items, failed: false });
      })
      .catch(() => {
        if (active) setState({ key: customerId, items: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  const current = state.key === key && key !== "";

  return {
    bookings: current
      ? state.items.filter(
          (booking) => booking.status !== "cancelled" && booking._id !== excludeId,
        )
      : [],
    loading: key !== "" && !current,
    failed: current && state.failed,
  };
}

/** "BK-260922-003 · Bella · Grooming Full · Sen 22 Sep 09.00" — one visit, in a picker. */
export function visitLabel(booking: Booking): string {
  const at = new Date(booking.scheduledAt);
  const day = at.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  const clock = `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;

  return [
    booking.bookingNumber ?? "Draf",
    booking.petName ?? "Hewan",
    booking.service?.name ?? null,
    `${day} ${clock}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
