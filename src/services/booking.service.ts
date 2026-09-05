import { apiClient } from "./api-client";
import type {
  BookingWorkStatus,
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

  /**
   * POST /bookings/:id/belongings — one thing just handed over the counter.
   *
   * A VERB, not a save of the whole list: two people adding two things at the
   * same moment must both get theirs. Counted as ARRIVED by default, unlike the
   * booking form's list — a thing added from the animal's own page is a thing
   * somebody is holding, while the form's is what the owner said they'd bring.
   */
  addBelonging: (
    bookingId: string,
    body: { petId: string; name: string; checkedIn?: boolean },
  ) => apiClient.post<Booking>(`/bookings/${bookingId}/belongings`, body),

  /**
   * PATCH /bookings/:id/items/:itemId/groomers — who is on ONE session.
   *
   * The lead (`groomerUserId`, `null` unassigns) and the extra hands beside
   * them. The booking form sets one default per animal; this is how a session
   * gets handed to somebody else once the day is running, or gains a second
   * person at the table.
   *
   * Only the LEAD earns: commission reads that field and nothing else. Both the
   * lead and the assistants are checked against the diary, so a `409` here is a
   * clash — send `forceClash` to save it anyway, as the booking form does.
   */
  setItemGroomers: (
    bookingId: string,
    itemId: string,
    patch: {
      groomerUserId?: string | null;
      assistantGroomerUserIds?: string[];
      forceClash?: boolean;
    },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/items/${itemId}/groomers`,
      patch,
    ),

  /**
   * PATCH /bookings/:id/pets/:petId/notes — one animal's two notes.
   *
   * ─── NOT `update`, AND THE DIFFERENCE IS MONEY ───────────────────────────
   *
   * `PATCH /bookings/:id` rebuilds the rows and re-snapshots every unbilled one
   * at today's catalogue price — the server's deliberate rule, because changing
   * what is being done is a new quote. Saving a note through it would reprice a
   * visit nobody meant to reprice, and the shop would find out on the bill. This
   * writes two strings and touches nothing else.
   *
   * SEND ONLY WHAT CHANGED. The two boxes save independently — one blurred while
   * the other is still being typed in — and a patch carrying both would overwrite
   * the half nobody submitted. `""` clears a note; the server stores null.
   */
  setPetNotes: (
    bookingId: string,
    petId: string,
    patch: { internalNotes?: string | null; customerNotes?: string | null },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/pets/${petId}/notes`,
      patch,
    ),

  /**
   * PATCH /bookings/:id/belongings/:belongingId — ticks ONE thing in or out.
   *
   * A VERB OF ITS OWN, not a corner of `update`. Two counters handing back two
   * animals' things at the same moment would each send the whole list, and the
   * second would carry the state it read before the first happened — quietly
   * un-returning an item somebody had already given back, on a booking the
   * completion guard then lets close.
   *
   * Handing back something never checked in is a `409`: there is nothing to give
   * back, and recording it would leave the pair in a state the guard reads as
   * settled.
   */
  checkBelonging: (
    bookingId: string,
    belongingId: string,
    patch: { checkedIn?: boolean; checkedOut?: boolean },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/belongings/${belongingId}`,
      patch,
    ),

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
   * PATCH /bookings/:id/items/:itemId/work — ONE ANIMAL's service moves.
   *
   * THIS IS THE STATUS ROUTE NOW, one animal at a time. "Mochi sudah selesai
   * mandi tapi Coco belum" was a sentence the system had no way to hold: status
   * lived on the booking, so a visit with two animals had one answer for both.
   *
   * NO `from` IS SENT. The server reads the row's current status itself; a
   * caller-supplied one is a second opinion about a fact the database holds.
   *
   * The BOOKING's own status follows from the rows — nothing here sets it.
   */
  advanceItemWork: (
    bookingId: string,
    itemId: string,
    workStatus: BookingWorkStatus,
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/items/${itemId}/work`,
      { workStatus },
    ),

  /**
   * PATCH /bookings/:id/items/:itemId/times — correcting the clock.
   *
   * SEPARATE FROM THE MOVE, and gated on `bookings:update` rather than
   * `advanceStatus`, because these two times decide `durationMin` in hindsight
   * and duration is what a commission matrix is read against. Somebody trusted
   * to say "this is done" is not, by that fact, trusted to say it took three
   * hours. Every correction is audited with both values.
   */
  correctItemTimes: (
    bookingId: string,
    itemId: string,
    times: { startedAt?: string | null; finishedAt?: string | null },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/items/${itemId}/times`,
      times,
    ),

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
