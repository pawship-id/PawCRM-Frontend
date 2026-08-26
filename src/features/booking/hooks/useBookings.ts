"use client";

import { useCallback, useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api-error";
import type {
  Booking,
  BookingListQuery,
  BookingOrigin,
  BookingStatus,
  PageResult,
} from "@/types/api";

/** The knobs the Booking screen drives. */
export interface BookingsQuery {
  page: number;
  /** "" = every status. */
  status: BookingStatus | "";
  /** "" = both. Tells an appointment apart from a walk-in rung up at the till. */
  origin: BookingOrigin | "";
  /** Calendar dates; the server expands them in the TENANT'S timezone. */
  scheduledFrom: string;
  scheduledTo: string;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: BookingsQuery = {
  page: 1,
  status: "",
  origin: "",
  scheduledFrom: "",
  scheduledTo: "",
};

const EMPTY_PAGE: PageResult<Booking>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseBookingsResult {
  bookings: Booking[];
  pagination: PageResult<Booking>["pagination"];
  query: BookingsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial change; anything but `page` returns to page 1. */
  setQuery: (patch: Partial<BookingsQuery>) => void;
  refetch: () => void;
}

/**
 * The booking list's query state and fetching.
 *
 * MIRRORS `useCustomers` — local state, a fetch effect keyed on the query, and
 * an explicit `refetch` the row actions call after they change a booking.
 *
 * NO SEARCH BOX, and therefore no debounce. The list is filtered by date and
 * status, not by typing: a day sheet is read by "who is here this morning", and
 * a booking has no name of its own to search for. That is also why this hook is
 * simpler than the one it mirrors.
 */
export function useBookings(): UseBookingsResult {
  const [query, setQueryState] = useState<BookingsQuery>(DEFAULT_QUERY);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Booking>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<BookingsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: BookingListQuery = {
      page: query.page,
      limit: PAGE_SIZE,
      status: query.status === "" ? undefined : query.status,
      origin: query.origin === "" ? undefined : query.origin,
      scheduledFrom: query.scheduledFrom || undefined,
      scheduledTo: query.scheduledTo || undefined,
    };

    bookingService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setBookings(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setBookings([]);
        // Our own sentence, never the server's — the API answers in English.
        setError(
          err instanceof ApiError
            ? "Daftar booking tidak bisa dimuat. Coba lagi."
            : "Daftar booking tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  return { bookings, pagination, query, loading, error, setQuery, refetch };
}
