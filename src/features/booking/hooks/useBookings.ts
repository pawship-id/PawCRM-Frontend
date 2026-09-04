"use client";

import { useCallback, useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api-error";
import type {
  Booking,
  BookingListQuery,
  BookingOrigin,
  BookingStatus,
  BookingUnbilledSummary,
  PageResult,
} from "@/types/api";

/** The knobs the Booking screen drives. */
export interface BookingsQuery {
  page: number;
  /** "" = every status. */
  status: BookingStatus | "";
  /** "" = both. Tells an appointment apart from a walk-in rung up at the till. */
  origin: BookingOrigin | "";
  /**
   * "" = everybody. Whose day sheet this is.
   *
   * A QUESTION ABOUT ROWS, not about the booking: the groomer sits on each
   * service since PCR-040, and a visit can be split between two people. So a
   * booking matches if ANY of its rows is theirs — which is what the shop means
   * by "Sinta's bookings today".
   */
  groomerUserId: string;
  /** Calendar dates; the server expands them in the TENANT'S timezone. */
  scheduledFrom: string;
  scheduledTo: string;
  /**
   * Only work somebody owes for that nobody has billed.
   *
   * A LENS RATHER THAN A FILTER, which is why it sits on a pill outside the bar
   * and not inside it: it is what the screen is opened to use when the question
   * is "what have we forgotten to charge for", and burying it behind a Filter
   * button would hide the one control that earns its place on the row.
   */
  unbilled: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: BookingsQuery = {
  page: 1,
  status: "",
  origin: "",
  groomerUserId: "",
  scheduledFrom: "",
  scheduledTo: "",
  unbilled: false,
};

const EMPTY_PAGE: PageResult<Booking>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseBookingsResult {
  bookings: Booking[];
  /**
   * How much work is unbilled RIGHT NOW, regardless of the current filter.
   *
   * NOT DERIVED FROM `bookings`. The list is paged and filtered; a count taken
   * from it would say "3" on a page of three and change as somebody paged
   * through — which is a number nobody could act on. The server answers it over
   * the whole book.
   *
   * Null while it is in flight or if it failed: the pill then shows no count
   * rather than a wrong one, and the list still works.
   */
  unbilled: BookingUnbilledSummary | null;
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
  const [unbilled, setUnbilled] = useState<BookingUnbilledSummary | null>(null);

  const setQuery = useCallback((patch: Partial<BookingsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /*
    THE SUMMARY IS ITS OWN FETCH, keyed only on `nonce`.

    It deliberately does NOT re-run when the filter changes: it answers "how much
    is unbilled in the whole book", and a figure that moved every time somebody
    picked a date would be answering a different question each time — and the
    pill's count would drop to zero the moment you filtered to a day with none.

    IT IS BEST EFFORT AND SILENT. `bookings:read` already covers it, so a failure
    here means the server is unwell rather than the role being wrong — and the
    list itself is what the screen is for. The pill shows no count and the page
    still works.
  */
  useEffect(() => {
    let active = true;

    bookingService
      .unbilledSummary()
      .then((summary) => {
        if (active) setUnbilled(summary);
      })
      .catch(() => {
        if (active) setUnbilled(null);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

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
      groomerUserId:
        query.groomerUserId === "" ? undefined : query.groomerUserId,
      scheduledFrom: query.scheduledFrom || undefined,
      scheduledTo: query.scheduledTo || undefined,
      // Sent only when ON. `unbilled: false` is not the opposite question — the
      // server does not support it — and sending it would be a filter nobody
      // asked for.
      unbilled: query.unbilled || undefined,
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

  return {
    bookings,
    unbilled,
    pagination,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
