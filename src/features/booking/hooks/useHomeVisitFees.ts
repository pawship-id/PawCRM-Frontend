"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import type { HomeVisitFees } from "@/types/api";

/**
 * What a house call costs, by zone, and how it is counted — for the booking
 * forms to PREVIEW (10 October 2026). The server prices the booking again.
 *
 * Read from the booking routes, not from the tenant's settings: the cashier who
 * books a house call may not be allowed to open Pengaturan, and a fee the form
 * cannot say is a fee the customer is not told.
 *
 * Best effort. `null` while loading or when the read failed, and the forms then
 * draw no fee rather than a wrong one. Only read when `enabled` (a home
 * booking), so a salon booking never pays for it.
 */
export function useHomeVisitFees(enabled: boolean): HomeVisitFees | null {
  const [fees, setFees] = useState<HomeVisitFees | null>(null);

  useEffect(() => {
    if (!enabled || fees) return;

    let active = true;

    Promise.resolve(bookingService.homeVisitFees())
      .then((found) => {
        if (active && found) setFees(found);
      })
      .catch(() => {
        /* The preview is an aid; saving is judged by the server. */
      });

    return () => {
      active = false;
    };
  }, [enabled, fees]);

  return fees;
}
