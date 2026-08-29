import { apiClient } from "./api-client";
import type {
  Booking,
  BookingListQuery,
  BookingStatus,
  CreateBookingInput,
  UpdateBookingInput,
  PageResult,
} from "@/types/api";

/**
 * Booking calls against /api/bookings.
 *
 * The tenant scope is derived from the session cookie by the backend, so it is
 * never passed here.
 *
 * PRICES CROSS THE WIRE AS STRINGS and are never parsed here — a component that
 * needs to show one formats the string, and one that needs arithmetic on it has
 * a bug worth noticing rather than papering over.
 */
export const bookingService = {
  /**
   * GET /bookings — paginated, sorted by `scheduledAt` ASCENDING by the server.
   *
   * The sort is not a parameter: a booking list is read as a day sheet, and the
   * next animal through the door is what matters.
   */
  list: (query: BookingListQuery = {}) =>
    apiClient.get<PageResult<Booking>>("/bookings", {
      query: {
        page: query.page,
        limit: query.limit,
        customerId: query.customerId,
        petId: query.petId,
        branchId: query.branchId,
        // An array becomes repeated `status=` params — see buildUrl. Joining
        // with a comma would send one value the enum check rejects.
        status: query.status,
        origin: query.origin,
        scheduledFrom: query.scheduledFrom,
        scheduledTo: query.scheduledTo,
        notPulled: query.notPulled,
      },
    }),

  /**
   * GET /bookings/bridge — what this customer has confirmed and not yet billed.
   *
   * Returns a BARE ARRAY, not a page: the answer is a handful of rows a modal
   * renders whole. "Confirmed" and "not already billed" are the definition of
   * the endpoint rather than parameters — and "not already billed" means neither
   * in a cashier's basket NOR on another invoice, which is one question the
   * server answers in one place.
   *
   * `days` WIDENS THE WINDOW BACKWARDS, and defaults to today alone. That
   * default is the TILL's answer: a cashier bills what is happening in front of
   * them. An invoice bills what has HAPPENED — a month of boarding, last week's
   * grooming — so it passes a wider window. Never forwards: offering an
   * appointment booked for next Friday would let somebody bill work not yet
   * done.
   *
   * The day boundary is resolved in the tenant's timezone by the server, which
   * is the part a caller would get wrong.
   */
  bridge: (customerId: string, days?: number) =>
    apiClient.get<Booking[]>("/bookings/bridge", {
      query: { customerId, days },
    }),

  /** GET /bookings/:id — a single booking. */
  getById: (id: string) => apiClient.get<Booking>(`/bookings/${id}`),

  /** POST /bookings — create a booking (201). */
  create: (input: CreateBookingInput) =>
    apiClient.post<Booking>("/bookings", input),

  /**
   * PATCH /bookings/:id — the editable surface, which does NOT include status.
   *
   * A completed or cancelled booking is frozen; the server answers 409.
   */
  update: (id: string, patch: UpdateBookingInput) =>
    apiClient.patch<Booking>(`/bookings/${id}`, patch),

  /**
   * PATCH /bookings/:id/status — move it through the state machine.
   *
   * Its own route because a transition has rules a `$set` cannot express. An
   * illegal one is a 409 whose `reason` says what state the server actually
   * found. `reason` here is the CANCELLATION reason, stored only on a cancel.
   */
  changeStatus: (id: string, status: BookingStatus, reason?: string | null) =>
    apiClient.patch<Booking>(`/bookings/${id}/status`, { status, reason }),
};
