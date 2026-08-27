import type { BookingStatus } from "@/types/api";

/**
 * Which status may follow which — a mirror of `BOOKING_TRANSITIONS` in
 * booking.model.js.
 *
 * A COPY, DELIBERATELY, and the server stays the authority: it refuses an
 * illegal move with a 409 whatever this file says. What this buys is a menu that
 * offers only moves that will be accepted — the alternative is a screen that
 * lists five actions and answers "conflict" to three of them.
 *
 * KEEP IT IN STEP WITH THE MODEL. It is small and it changes rarely; when it
 * does, both files change together.
 */
const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft: ["confirmed", "check_in", "cancelled"],
  confirmed: ["check_in", "in_progress", "completed", "cancelled"],
  check_in: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * What each move is CALLED as an action, which is not what the status is called
 * as a state.
 *
 * A menu row is something somebody does — "Check-in", "Batalkan" — while a badge
 * is a fact about the booking ("Sudah check-in"). `BOOKING_STATUS_LABELS` names
 * the state and this names the act; using one for both is how a menu ends up
 * reading like a list of adjectives.
 */
export const BOOKING_STATUS_ACTIONS: Record<BookingStatus, string> = {
  draft: "Kembalikan ke draf",
  confirmed: "Konfirmasi",
  check_in: "Check-in",
  in_progress: "Mulai dikerjakan",
  completed: "Tandai selesai",
  cancelled: "Batalkan booking",
};

/**
 * The forward moves offered for a booking in `status`, in ladder order.
 *
 * CANCELLATION IS NOT HERE. It is not a step forward, it needs its own
 * permission (`bookings:cancel`, not `update`), and it asks for a reason — so
 * the caller renders it separately rather than having to filter it back out of
 * this list every time.
 */
export function forwardStatuses(status: BookingStatus): BookingStatus[] {
  return BOOKING_TRANSITIONS[status].filter((next) => next !== "cancelled");
}

/** Whether a booking may still be called off. */
export function canCancel(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].includes("cancelled");
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
  from: BookingStatus,
  to: BookingStatus,
): BookingStatus[] {
  const ladder: BookingStatus[] = [
    "draft",
    "confirmed",
    "check_in",
    "in_progress",
    "completed",
  ];

  const start = ladder.indexOf(from);
  const end = ladder.indexOf(to);

  // `cancelled` is off the ladder — it fills in nothing behind it.
  if (start === -1 || end === -1) return [];

  return ladder.slice(start + 1, end);
}
