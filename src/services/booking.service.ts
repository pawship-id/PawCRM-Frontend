import { apiClient } from "./api-client";
import type {
  BookingWorkStatus,
  Booking,
  BookingCalendar,
  BookingCalendarQuery,
  BookingListQuery,
  AffectedBooking,
  GroomerAvailability,
  GroomerCapacityDay,
  BookingStatus,
  BookingUnbilledSummary,
  CreateBookingInput,
  CreateBookingResult,
  UpdateBookingInput,
  PageResult,
  ServiceBookingCounts,
  ServiceBookingCountScope,
  SessionMediaKind,
} from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

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
        // Listed key by key because `query` is copied that way: a field the
        // type allows but this object omits is dropped silently, which is how
        // the Groomer filter shipped dead.
        groupId: query.groupId,
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
   * GET /bookings/service-counts — how many bookings each service has been on,
   * for the grooming catalogue's "N booking". Draft and cancelled work is not
   * counted; every asked id comes back, zero when unused.
   *
   * ONE REQUEST FOR A PAGE of the catalogue, ids as repeated params. `bookings:
   * read` — a caller without it should not ask. `scope` narrows the count to a
   * branch and a period; without it the count is all-time.
   */
  serviceCounts: (serviceIds: string[], scope: ServiceBookingCountScope = {}) =>
    apiClient.get<ServiceBookingCounts>("/bookings/service-counts", {
      query: {
        serviceIds,
        branchId: scope.branchId,
        scheduledFrom: scope.scheduledFrom,
        scheduledTo: scope.scheduledTo,
      },
    }),

  /**
   * POST /bookings/:id/belongings — one thing just handed over the counter.
   *
   * A VERB, not a save of the whole list: two people adding two things at the
   * same moment must both get theirs. Counted as ARRIVED by default, unlike the
   * booking form's list — a thing added from the booking's own page is a thing
   * somebody is holding, while the form's is what the owner said they'd bring.
   */
  addBelonging: (
    bookingId: string,
    body: { name: string; checkedIn?: boolean },
  ) => apiClient.post<Booking>(`/bookings/${bookingId}/belongings`, body),

  /**
   * PATCH /bookings/:id/sessions — who is on a turn, and how many turns exist.
   *
   * Two people on one bath are two SESSIONS, and both earn — so "add an
   * assistant" is "add a session".
   *
   * THREE SHAPES, ONE CALL, matching the one card that does all three. A
   * booking has exactly one main service, so adding a turn names nothing but
   * the turn:
   *   { sessionName?, groomerUserIds? }   add a turn (no `sessionId`)
   *   { sessionId, groomerUserIds, groomerShares? }   set who is on it
   *   { sessionId, remove: true }         take the turn off
   *
   * ⚠️ THE CREW IS SENT WHOLESALE, never as a delta. The screen edits it as a
   * list — a groomer is picked or unpicked from a set — and add/remove verbs
   * would leave a moment where a running turn has nobody on it.
   *
   * `groomerShares` IS EACH PERSON'S PART OF THE TURN'S COMMISSION, keyed by
   * user id. It must name exactly the crew and add up to 100, or the server
   * answers 400. Left out, the server splits the turn evenly — which is what a
   * crew change should do.
   */
  setSessionCrew: (
    bookingId: string,
    patch:
      | { sessionName?: string; groomerUserIds?: string[] }
      | {
          sessionId: string;
          groomerUserIds: string[];
          groomerShares?: Record<string, number> | null;
        }
      | { sessionId: string; remove: true },
  ) => apiClient.patch<Booking>(`/bookings/${bookingId}/sessions`, patch),

  /**
   * PATCH /bookings/:id/notes — the booking's two notes.
   *
   * ─── NOT `update`, AND THE DIFFERENCE IS MONEY ───────────────────────────
   *
   * `PATCH /bookings/:id` re-snapshots the service at today's catalogue price
   * when it is still unbilled — the server's deliberate rule, because changing
   * what is being done is a new quote. Saving a note through it would reprice a
   * visit nobody meant to reprice, and the shop would find out on the bill. This
   * writes two strings and touches nothing else.
   *
   * SEND ONLY WHAT CHANGED. The two boxes save independently — one blurred while
   * the other is still being typed in — and a patch carrying both would overwrite
   * the half nobody submitted. `""` clears a note; the server stores null.
   */
  setNotes: (
    bookingId: string,
    patch: { internalNotes?: string | null; customerNotes?: string | null },
  ) => apiClient.patch<Booking>(`/bookings/${bookingId}/notes`, patch),

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

  /**
   * POST /bookings — one save, one group, one booking per entry (201).
   *
   * THE ANSWER IS THE GROUP, not a booking: a form that took Mochi and Coco made
   * two, and the screen decides where to go next by how many came back.
   */
  create: (input: CreateBookingInput) =>
    apiClient.post<CreateBookingResult>("/bookings", input),

  /**
   * PATCH /bookings/:id — the editable surface, which does NOT include status.
   *
   * A completed or cancelled booking is frozen; the server answers 409.
   */
  update: (id: string, patch: UpdateBookingInput) =>
    apiClient.patch<Booking>(`/bookings/${id}`, patch),

  /**
   * PATCH /bookings/:id/group — "Tautkan booking": into another visit of the
   * same customer, or (`null`) out into one of its own. Answers with `group[]`
   * and `related[]`, like GET /bookings/:id (21 September 2026).
   */
  setGroup: (id: string, groupId: string | null) =>
    apiClient.patch<Booking>(`/bookings/${id}/group`, { groupId }),

  /**
   * PATCH /bookings/:id/status — move it through the state machine.
   *
   * Its own route because a transition has rules a `$set` cannot express. An
   * illegal one is a 409 whose `reason` says what state the server actually
   * found. `reason` here is the CANCELLATION reason, stored only on a cancel.
   *
   * ONE BOOKING, ONE ANIMAL. Two dogs arriving together are two bookings, each
   * moved by its own call — the server has no group move in this phase.
   */
  changeStatus: (id: string, status: BookingStatus, reason?: string | null) =>
    apiClient.patch<Booking>(`/bookings/${id}/status`, { status, reason }),

  /**
   * POST /bookings/:id/reschedule — the appointment moves to another time.
   *
   * ─── NOT A `changeStatus`, AND NOT AN EDIT TO THE DATE FIELD ─────────────
   *
   * `PATCH /bookings/:id` can already change `scheduledAt`, and goes on doing so:
   * that is correcting a typo made while writing the booking down. This is the
   * other thing — the customer rang and cannot come on Thursday — and only one of
   * the two belongs in the trail. A shop asking "how often do we get moved"
   * cannot answer it from a field that was overwritten.
   *
   * The booking comes back on `confirmed`; `rescheduled` is written to the
   * history rather than stored as a status. The new time is checked against the
   * diary exactly like a new booking, so a `400` here is a clash — send
   * `forceClash` to save it anyway, as the booking form does.
   */
  reschedule: (
    id: string,
    body: { scheduledAt: string; forceClash?: boolean },
  ) => apiClient.post<Booking>(`/bookings/${id}/reschedule`, body),

  /**
   * PATCH /bookings/:id/sessions/:sessionId/work — ONE TURN moves.
   *
   * NO `from` IS SENT. The server reads the session's current status itself; a
   * caller-supplied one is a second opinion about a fact the database holds.
   *
   * The service's own status follows from its sessions — nothing here sets it.
   */
  advanceSessionWork: (
    bookingId: string,
    sessionId: string,
    workStatus: BookingWorkStatus,
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/sessions/${sessionId}/work`,
      { workStatus },
    ),

  /**
   * PATCH /bookings/:id/media — the BOOKING's own album.
   *
   * ⚠️ A DIFFERENT ARRAY FROM `setSessionRecord`'s `media`, not a different view
   * of it. A turn's photos are evidence for that stretch of work; these are
   * about the visit. Which button somebody pressed decides where one lands.
   *
   * SENT WHOLESALE. An asset already in the album carries no `token` — the API
   * never stores one — and the server tells stored from new by `storageKey`.
   */
  setMedia: (id: string, media: (MediaAsset & { kind?: SessionMediaKind })[]) =>
    apiClient.patch<Booking>(`/bookings/${id}/media`, { media }),

  /**
   * PATCH /bookings/:id/sessions/:sessionId/record — what happened on one turn.
   *
   * ⚠️ SEPARATE FROM `setSessionCrew`, and not a fourth shape on it. The crew is
   * ARRANGED and closes when the turn finishes; the notes and the photographs
   * are WRITTEN DOWN, and the "after" shot is taken after that.
   *
   * ⚠️ EVERY FIELD IS OPTIONAL AND ABSENCE MEANS "LEAVE IT" — so a screen
   * editing one note does not have to send the gallery back to avoid clearing
   * it. `null` on a note is a real value and clears one.
   *
   * `media` IS SENT WHOLESALE when sent at all: the gallery is edited as a list.
   * Each asset must be one `mediaService.upload` returned, `token` included —
   * the API refuses anything else.
   */
  setSessionRecord: (
    id: string,
    sessionId: string,
    patch: {
      notesSession?: string | null;
      notesInternalSession?: string | null;
      media?: (MediaAsset & { kind?: SessionMediaKind })[];
    },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${id}/sessions/${sessionId}/record`,
      patch,
    ),

  /**
   * PATCH /bookings/:id/sessions/:sessionId/times — correcting the clock.
   *
   * SEPARATE FROM THE MOVE, and gated on `bookings:update` rather than
   * `advanceStatus`, because these two times decide `durationMin` in hindsight
   * and duration is what a commission matrix is read against. Somebody trusted
   * to say "this is done" is not, by that fact, trusted to say it took three
   * hours. Every correction is audited with both values.
   */
  correctSessionTimes: (
    bookingId: string,
    sessionId: string,
    times: { startedAt?: string | null; finishedAt?: string | null },
  ) =>
    apiClient.patch<Booking>(
      `/bookings/${bookingId}/sessions/${sessionId}/times`,
      times,
    ),

  /**
   * PATCH /bookings/:id/groomer — PCR-035. Puts a name on a slot, nothing else.
   *
   * NOT `update({ serviceId })`, which re-snapshots the price at today's rate. A
   * booking raised beside an invoice was billed at the price on that bill, so
   * re-quoting it to write a groomer's name in would leave the appointment and
   * the invoice disagreeing about what the customer owes.
   *
   * `null` UNASSIGNS — somebody rostered off goes back to "Belum ditentukan",
   * the state the booking was born in. It covers every live session of this
   * booking.
   */
  assignGroomer: (id: string, groomerUserId: string | null) =>
    apiClient.patch<Booking>(`/bookings/${id}/groomer`, { groomerUserId }),

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
  availability: (date: string, role: "groomer" | "driver" = "groomer") =>
    apiClient.get<GroomerAvailability[]>("/bookings/availability", {
      /* `role` only when it is not the default — the request stays as it was. */
      query: role === "driver" ? { date, role } : { date },
    }),

  /**
   * GET /bookings/capacity?date= — every groomer's minutes that day: what they
   * may take, and what is already booked.
   *
   * `date` IS A LOCAL `YYYY-MM-DD`, never `toISOString()` — which is yesterday
   * for anybody east of London before seven in the morning.
   */
  capacity: (date: string) =>
    apiClient.get<GroomerCapacityDay>("/bookings/capacity", {
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
