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
 * What the booking must carry for any of this to be answerable.
 *
 * A STATUS IS NOT ENOUGH ANY MORE, and that is the whole shape of this file
 * since the trip legs landed: whether `pickup` is the next rung depends on
 * whether anybody asked to be fetched. Callers that used to pass a bare status
 * now pass the booking.
 */
export type BookingLike = Pick<
  Booking,
  "status" | "pickupRequested" | "deliveryRequested"
>;

/**
 * The path THIS booking walks — a mirror of `ladderFor` on the server.
 *
 * A booking with no pickup never passes through `pickup`, and offering it would
 * put a van journey on a trail that never left the shop.
 */
export function ladderFor(booking: BookingLike): BookingStatus[] {
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
    A DRAFT MAY NOT JUMP PAST THE ANIMAL ARRIVING. It is a line in a basket
    somebody may yet empty, and landing one on `completed` would mint a finished,
    commissioned visit out of something nobody ever agreed to.
  */
  const ceiling =
    booking.status === "draft" ? ladder.indexOf("arrived") : ladder.length - 1;

  const forward = ladder.slice(at + 1, ceiling + 1);

  return hasCompletedWork(booking) ? forward : [...forward, "cancelled"];
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

  const ladder = ladderFor(booking);
  const at = ladder.indexOf(booking.status);

  return at !== -1 && at < ladder.indexOf("arrived");
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
