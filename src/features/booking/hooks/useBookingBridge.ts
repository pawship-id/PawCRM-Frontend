"use client";

import { useCallback, useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api-error";
import type { Booking, OrphanTrip } from "@/types/api";

interface UseBookingBridgeResult {
  bookings: Booking[];
  /**
   * Trips left behind — owed, every booking of them billed (11 October 2026).
   * Best effort: a failed read is an empty list, never the bridge's error.
   */
  trips: OrphanTrip[];
  loading: boolean;
  error: string | null;
  /** Re-ask — call after pulling, so a pulled booking drops out of the list. */
  refetch: () => void;
}

/**
 * What this customer has on today that is billable and not already in a cart.
 *
 * ONE ARGUMENT, and everything else is the endpoint's definition rather than
 * this hook's business: "today", "not cancelled" and "not already pulled" are
 * resolved by the server, and "today" in particular is resolved in the TENANT'S
 * timezone. A cashier in Jakarta opening the till at 06:00 would otherwise be
 * shown yesterday's list.
 *
 * THE LIST IS NO LONGER ALL `confirmed`. Every status but `cancelled` comes back
 * — a grooming under way, one already finished, a draft nobody confirmed — so
 * anything rendering these rows says which is which.
 *
 * `null` means no customer is selected, and the hook asks nothing — the POS
 * banner only exists once somebody has been chosen.
 */
export function useBookingBridge(
  customerId: string | null,
): UseBookingBridgeResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<OrphanTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!customerId) {
      /*
        Clearing on deselect, not deriving: the previous customer's bookings must
        not linger behind a banner that now names somebody else. The rule below
        is disabled knowingly — this IS synchronising React state with an
        external fact (which customer the till is on), and the alternative,
        deriving `bookings` during render, would mean re-fetching on every
        render instead.
      */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBookings([]);
      setTrips([]);
      return;
    }

    let active = true;
    // The sanctioned fetch-effect shape — see useCustomers.
     
    setLoading(true);
    setError(null);

    /* Best effort — wrapped, so a missing answer is simply no trips. */
    Promise.resolve(bookingService.bridgeTrips(customerId))
      .then((result) => {
        if (active) setTrips(result ?? []);
      })
      .catch(() => {
        if (active) setTrips([]);
      });

    bookingService
      .bridge(customerId)
      .then((result) => {
        if (!active) return;
        setBookings(result);
      })
      .catch((err) => {
        if (!active) return;
        setBookings([]);
        // Our own sentence, never the server's — the API answers in English.
        setError(
          err instanceof ApiError
            ? "Booking pelanggan ini tidak bisa dimuat. Coba lagi."
            : "Booking pelanggan ini tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId, nonce]);

  return { bookings, trips, loading, error, refetch };
}
