"use client";

import { useCallback, useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api-error";
import type { Booking } from "@/types/api";

interface UseBookingBridgeResult {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  /** Re-ask — call after pulling, so a pulled booking drops out of the list. */
  refetch: () => void;
}

/**
 * What this customer has confirmed for today that is not already in a cart.
 *
 * ONE ARGUMENT, and everything else is the endpoint's definition rather than
 * this hook's business: "today", "confirmed" and "not already pulled" are
 * resolved by the server, and "today" in particular is resolved in the TENANT'S
 * timezone. A cashier in Jakarta opening the till at 06:00 would otherwise be
 * shown yesterday's list.
 *
 * `null` means no customer is selected, and the hook asks nothing — the POS
 * banner only exists once somebody has been chosen.
 */
export function useBookingBridge(
  customerId: string | null,
): UseBookingBridgeResult {
  const [bookings, setBookings] = useState<Booking[]>([]);
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
      return;
    }

    let active = true;
    // The sanctioned fetch-effect shape — see useCustomers.
     
    setLoading(true);
    setError(null);

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

  return { bookings, loading, error, refetch };
}
