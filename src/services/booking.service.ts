import { apiClient } from "./api-client";
import type {
  Booking,
  BookingCalendar,
  BookingCalendarQuery,
  BookingListQuery,
  AffectedBooking,
  GroomerAvailability,
  BookingStatus,
  BookingUnbilledSummary,
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
        // A question about ROWS, like `petId` — the server resolves it to
        // booking ids and intersects the two. Listed here because `query` is
        // copied key by key: a field the type allows but this object omits is
        // dropped silently, which is how the Groomer filter shipped dead.
        groomerUserId: query.groomerUserId,
        branchId: query.branchId,
        // An array becomes repeated `status=` params — see buildUrl. Joining
        // with a comma would send one value the enum check rejects.
        status: query.status,
        origin: query.origin,
        scheduledFrom: query.scheduledFrom,
        scheduledTo: query.scheduledTo,
        notPulled: query.notPulled,
        unbilled: query.unbilled,
      },
    }),

  /**
   * GET /bookings/bridge — what this customer has that is billable and not yet
   * billed: every status but `cancelled`, nothing already in a basket or on an
   * invoice.
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

  /**
   * GET /bookings/unbilled-summary — how much work is owed for and unbilled.
   *
   * A SUMMARY, NOT A LIST. The rows come from `list({ unbilled: true })`, so
   * there is one list and one filter rather than a second endpoint returning the
   * same documents in a different shape. This answers only the part a list
   * cannot: how many there are BEFORE anybody filters, which is what lets the
   * screen say there is billing to do without being asked.
   */
  unbilledSummary: () =>
    apiClient.get<BookingUnbilledSummary>("/bookings/unbilled-summary"),

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

  /**
   * PATCH /bookings/:id/groomer — PCR-035. Puts a name on a slot, nothing else.
   *
   * NOT `update({items})`, which re-snapshots every price at today's rates. A
   * booking raised beside an invoice was billed at the price on that bill, so
   * re-quoting it to write a groomer's name in would leave the appointment and
   * the invoice disagreeing about what the customer owes.
   *
   * `null` UNASSIGNS — somebody rostered off goes back to "Belum ditentukan",
   * the state the booking was born in. `serviceId` narrows it to one service;
   * omitted, it covers the whole visit, which is the usual case.
   */
  assignGroomer: (
    id: string,
    groomerUserId: string | null,
    serviceId?: string,
  ) =>
    apiClient.patch<Booking>(`/bookings/${id}/groomer`, {
      groomerUserId,
      serviceId,
    }),

  /**
   * GET /bookings/calendar — the day sheet, drawn.
   *
   * ONE OBJECT, not a page: the range bounds the answer, and the screen needs
   * the groomer columns and the blocks together to draw anything at all.
   */
  /**
   * GET /bookings/availability?date= — who may be booked that day, and why not.
   *
   * A BARE ARRAY: a handful of names a dropdown renders whole.
   */
  availability: (date: string) =>
    apiClient.get<GroomerAvailability[]>("/bookings/availability", {
      query: { date },
    }),

  calendar: (query: BookingCalendarQuery = {}) =>
    apiClient.get<BookingCalendar>("/bookings/calendar", {
      query: {
        branchId: query.branchId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),

  /**
   * GET /bookings/affected-by-leave — the live bookings a proposed leave would
   * strand (FR-4 kriteria 4.9).
   *
   * ASKED BEFORE SAVING, never after. Marking somebody off for next Wednesday
   * when they already have four animals booked is a DECISION, not a typo, and it
   * has to be made with the four animals visible.
   */
  affectedByLeave: (groomerUserId: string, dates: string[]) =>
    apiClient.get<AffectedBooking[]>("/bookings/affected-by-leave", {
      query: { groomerUserId, dates },
    }),
};
