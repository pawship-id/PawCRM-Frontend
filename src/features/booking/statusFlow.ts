import type { Booking, BookingStatus } from "@/types/api";

/**
 * Every rung, in order — the shape of a visit with BOTH trip legs.
 *
 * A MIRROR of `BOOKING_LADDER_FULL` in booking.model.js. `frontendEnumParity`
 * on the server checks that `BookingStatus` knows every value it can send; this
 * file is the other half — the ORDER, which no test can read off a type.
 *
 * `cancelled` and `rescheduled` are absent: neither is a rung. One is a way out,
 * the other a note about the date.
 */
const LADDER: BookingStatus[] = [
  "draft",
  "requested",
  "confirmed",
  "pickup",
  "arrived",
  "in_progress",
  "completed",
  "delivery",
  "return_to_pawrents",
];

/**
 * ─── A RIDE WALKS FOUR RUNGS (23 September 2026) ────────────────────────────
 *
 * A MIRROR of `RIDE_LADDER` in booking.model.js. Draft · Confirmed · On the Way
 * · Arrived, under the ordinary status names — see `RIDE_STATUS_LABELS` for
 * what each is called on a van.
 *
 * ⚠️ "ARRIVED" IS `completed`. A ride resting on `arrived` would never count as
 * unbilled, and a journey that ends has to be billable.
 */
const RIDE_LADDER: BookingStatus[] = [
  "draft",
  "confirmed",
  "in_progress",
  "completed",
];

/**
 * What the booking must carry for any of this to be answerable.
 *
 * A STATUS IS NOT ENOUGH, and that is the whole shape of this file since the
 * trip legs landed: whether `pickup` is the next rung depends on whether anybody
 * asked to be fetched. So every function takes the booking, not a bare status.
 */
export type BookingLike = Pick<
  Booking,
  "status" | "pickupRequested" | "deliveryRequested"
> &
  Partial<Pick<Booking, "tripLeg">>;

/**
 * The path THIS booking walks — a mirror of `ladderFor` on the server.
 *
 * A booking with no pickup never passes through `pickup`, and offering it would
 * put a van journey on a trail that never left the shop.
 */
export function ladderFor(
  booking: Pick<Booking, "pickupRequested" | "deliveryRequested"> &
    Partial<Pick<Booking, "tripLeg">>,
): BookingStatus[] {
  /* A ride IS the journey — it walks its own, shorter path. */
  if (booking.tripLeg) return [...RIDE_LADDER];

  return LADDER.filter((status) => {
    if (status === "pickup") return Boolean(booking.pickupRequested);
    if (status === "delivery") return Boolean(booking.deliveryRequested);
    return true;
  });
}

/**
 * Which statuses may follow — a mirror of `transitionsFor` in booking.model.js.
 *
 * A COPY, DELIBERATELY, and the server stays the authority: it refuses an
 * illegal move with a 409 whatever this file says. What this buys is a menu that
 * offers only moves that will be accepted — the alternative is a screen that
 * lists five actions and answers "conflict" to three of them.
 *
 * KEEP IT IN STEP WITH THE MODEL. Both files change together.
 */
export function transitionsFor(booking: BookingLike): BookingStatus[] {
  const ladder = ladderFor(booking);
  const at = ladder.indexOf(booking.status);

  /* `rescheduled` is never a stored status; an unknown value moves nowhere. */
  if (at === -1) return [];

  /*
    A DRAFT MAY NOT REACH A RUNG WHERE THE WORK HAS STARTED. It is a line in a
    basket somebody may yet empty, and landing one on `completed` would mint a
    finished, commissioned visit out of something nobody ever agreed to.

    ⚠️ "ONE SHORT OF `in_progress`", NOT THE LITERAL `arrived` (23 September
    2026). On the full ladder they are the same rung — nothing changed for a
    grooming — but a ride has no `arrived`, and naming it would leave `indexOf`
    at -1 and freeze every draft van. A draft ride stops at Confirmed.
  */
  const ceiling =
    booking.status === "draft"
      ? ladder.indexOf("in_progress") - 1
      : ladder.length - 1;

  const forward = ladder.slice(at + 1, ceiling + 1);

  return hasCompletedWork(booking) ? forward : [...forward, "cancelled"];
}

/**
 * Whether a session on this booking may be worked yet.
 *
 * A mirror of the gate on `PATCH /bookings/:id/sessions/:sessionId/work`: a turn
 * can only move once the booking is at `in_progress`. Agreeing an appointment
 * and arriving are facts about the visit; `in_progress` is somebody saying "we
 * have started on this dog", and until they have, a turn moving is work
 * recorded against a visit nobody has begun.
 *
 * ⚠️ THE ANIMAL IS PUT ON THE TABLE BY A PERSON, not by starting a turn. The
 * server also DERIVES `in_progress` from a service leaving `pending`, so read
 * naively the two rules are a deadlock. What breaks it is the status control —
 * "Start work" — which is why the message beside the disabled button points
 * there rather than at the crew.
 *
 * ⚠️ READ OFF `LADDER`, NOT `ladderFor(booking)`. The trip rungs come and go
 * with the booking, and a comparison that moved with them would answer
 * differently for the same animal depending on whether a van was booked.
 *
 * "AT OR PAST", NOT "IS": a dog handed back wet comes off the table again, and
 * a booking already `completed` must still be able to reopen a turn.
 *
 * `cancelled` and `rescheduled` are not on the ladder and fall to -1, which
 * refuses — the safe answer for a status this function does not recognise.
 */
export function canStartWork(booking: Pick<Booking, "status">): boolean {
  const at = LADDER.indexOf(booking.status);

  return at !== -1 && at >= LADDER.indexOf("in_progress");
}

/**
 * Whether the work is finished — `completed` or anything after it.
 *
 * SEPARATE FROM "is it over", and the distinction is the sharpest edge of the
 * wider ladder. `completed` fires commission and the money is usually taken;
 * what happens afterwards is about the ANIMAL. So anything touching money — the
 * edit form, re-crewing a session — closes here, while a note or a belonging
 * stays open until the animal actually goes home.
 */
export function hasCompletedWork(booking: BookingLike): boolean {
  const ladder = ladderFor(booking);
  const at = ladder.indexOf(booking.status);

  return at !== -1 && at >= ladder.indexOf("completed");
}

/**
 * What each move is CALLED as an action, which is not what the status is called
 * as a state.
 *
 * ─── IN ENGLISH, WITH THE STATUS NAMES — ui-rules §12 ──────────────────────
 *
 * These were Bahasa and the exception was scoped to the badge alone, on the
 * argument that a menu row is a SENTENCE (what somebody does) while a badge is a
 * NAME. The shop looked at the result and asked for the menu too, and they are
 * right about the thing the argument missed: a menu of Indonesian verbs whose
 * only purpose is to reach English-named rungs made every row a translation
 * step — "Serahkan ke pemilik" to arrive at a badge reading "Return to
 * Pawrents". Half a screen in each language is worse than either.
 *
 * STILL VERBS, NOT THE NAMES REPEATED. "Confirmed" as a menu row reads as a
 * fact about the booking rather than something to press; each row says what
 * pressing it DOES, and lands on the status it is named after.
 *
 * IT STOPS AT THE MENU. The dialog that opens behind these rows, its warnings,
 * the cancel-reason field and every toast stay in Bahasa — those are sentences,
 * and §12 is about sentences.
 */
export const BOOKING_STATUS_ACTIONS: Record<BookingStatus, string> = {
  draft: "Move back to draft",
  requested: "Mark as requested",
  confirmed: "Confirm booking",
  pickup: "Start pickup",
  arrived: "Mark arrived",
  in_progress: "Start work",
  completed: "Mark completed",
  delivery: "Start delivery",
  return_to_pawrents: "Return to pawrents",
  cancelled: "Cancel booking",
  /* Never offered as a move — rescheduling has its own dialog and its own date. */
  rescheduled: "Reschedule",
};

/**
 * The same rows, said about a VAN (23 September 2026).
 *
 * Only the two that differ are listed. "Start work" is what somebody does to an
 * animal; a driver sets off, and what ends is a journey rather than a grooming.
 * Everything not named here keeps its ordinary row.
 */
const RIDE_STATUS_ACTIONS: Partial<Record<BookingStatus, string>> = {
  in_progress: "Start the trip",
  completed: "Mark arrived",
};

/** The row for this move, worded for the booking it is offered on. */
export function bookingStatusAction(
  status: BookingStatus,
  booking?: Partial<Pick<Booking, "tripLeg">>,
): string {
  return (
    (booking?.tripLeg ? RIDE_STATUS_ACTIONS[status] : undefined) ??
    BOOKING_STATUS_ACTIONS[status]
  );
}

/**
 * The forward moves offered for a booking, in ladder order.
 *
 * CANCELLATION IS NOT HERE. It is not a step forward, it needs its own
 * permission (`bookings:cancel`, not `update`), and it asks for a reason — so
 * the caller renders it separately rather than having to filter it back out of
 * this list every time.
 */
export function forwardStatuses(booking: BookingLike): BookingStatus[] {
  return transitionsFor(booking).filter((next) => next !== "cancelled");
}

/** Whether a booking may still be called off. */
export function canCancel(booking: BookingLike): boolean {
  return transitionsFor(booking).includes("cancelled");
}

/**
 * Whether the appointment may still be moved to another day.
 *
 * MIRRORS `BookingService#reschedule`. Not a draft — its date is edited on the
 * form, and landing it on `confirmed` through a button labelled "reschedule"
 * would confirm an appointment nobody agreed to. Not once the animal is here:
 * moving the date of a visit that is happening describes nothing, and that is a
 * new booking.
 */
export function canReschedule(booking: BookingLike): boolean {
  if (booking.status === "draft") return false;

  return !hasStarted(booking);
}

/**
 * Whether the visit is UNDER WAY — a mirror of `hasStarted` on the server.
 *
 * The animal arriving, or, on a ride, the van leaving (23 September 2026). A
 * ride has no `arrived` rung, so a comparison naming it answered -1 and called
 * every van "already started" — including one booked for next Tuesday.
 *
 * ⚠️ NOT THE SAME LINE AS THE DRAFT CEILING, which asks where WORK starts. A
 * dog that is here but not yet on the table has arrived — its date is fixed —
 * while nobody has started on it.
 */
export function hasStarted(booking: BookingLike): boolean {
  const ladder = ladderFor(booking);
  const at = ladder.indexOf(booking.status);
  const started = booking.tripLeg ? "in_progress" : "arrived";

  return at !== -1 && at >= ladder.indexOf(started);
}

/**
 * The statuses this move records, given where the booking stands.
 *
 * MIRRORS THE SERVER'S BACKFILL: a jump forward fills in the rungs it skipped,
 * because a status skipped is still one the booking passed through — nobody
 * hands over a dog for an appointment that was never agreed. The UI needs the
 * same answer to warn before the move rather than after it.
 *
 * Returns only the IMPLIED rungs; the move itself is what the caller asked for.
 */
export function impliedStatuses(
  booking: BookingLike,
  to: BookingStatus,
): BookingStatus[] {
  const ladder = ladderFor(booking);
  const start = ladder.indexOf(booking.status);
  const end = ladder.indexOf(to);

  // `cancelled` is off the ladder — it fills in nothing behind it.
  if (start === -1 || end === -1) return [];

  return ladder.slice(start + 1, end);
}
