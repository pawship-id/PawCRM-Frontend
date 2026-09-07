import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/api";

/**
 * What each status is CALLED on screen — in English, and that is a deliberate
 * exception to ui-rules §12.
 *
 * ─── WHY THE ONE PLACE THIS APP SPEAKS ENGLISH ────────────────────────────
 *
 * §12 says the product UI is Bahasa Indonesia and it still does; this is the
 * exception the shop asked for, recorded in ui-rules §12 so nobody translates it
 * back as a tidy-up.
 *
 * These eleven words are the NAMES OF THE RUNGS, and a name is not a sentence.
 * The shop talks about them in English already — "bookingnya masih requested",
 * "sudah in progress" — because that is what the schedule board and the trade
 * call them. Translating produced labels that were longer than the thing they
 * named ("Sudah dijemput pemilik" for `return_to_pawrents`) and that nobody said
 * out loud, so the badge and the conversation used different words for one fact.
 *
 * IT STOPS AT THE STATUS. Every button, hint, empty state and error stays in
 * Bahasa — including `BOOKING_STATUS_ACTIONS`, which names what somebody DOES
 * ("Hewan sudah datang") rather than what the booking IS. Those are sentences,
 * and §12 is about sentences.
 *
 * THEY MATCH THE STORED VALUES, word for word, which is the other half of the
 * argument: a reader looking at `in_progress` in an export and "In Progress" on
 * a badge does not have to hold a translation table in their head.
 */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Draft",
  /* Written down and asked for; the shop has not agreed yet. */
  requested: "Requested",
  confirmed: "Confirmed",
  /* The van is out. Only on a booking that asked to be fetched. */
  pickup: "Pickup",
  /* The animal is at the shop. `check_in` renamed — the word people use. */
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  /* The van has left with it. Only on a booking that asked to be taken home. */
  delivery: "Delivery",
  return_to_pawrents: "Return to Pawrents",
  cancelled: "Cancelled",
  /*
    A TRAIL ENTRY, NOT A STATE. No booking is ever in it — the label exists
    because the history card renders whatever the trail holds, and the one place
    this word appears is there.
  */
  rescheduled: "Rescheduled",
};

/**
 * The tint per status. Orange is reserved for the one that means A HUMAN MUST
 * ACT — an animal on the table right now — because ui-rules §4 gives it exactly
 * that meaning and spends it nowhere else.
 */
const STATUS_STYLES: Record<BookingStatus, string> = {
  draft: "bg-muted/40 text-muted",
  /*
    WARM, BECAUSE SOMEBODY HAS TO ANSWER IT. A request nobody has confirmed is
    the one state in this list that is waiting on the SHOP rather than on the
    day — which is §4's definition of the accent, and why it is spent here.
  */
  requested: "bg-tint-warning text-warning",
  confirmed: "bg-navy-100 text-primary",
  /* The two trip legs read as travel, not as a state of the animal. */
  pickup: "bg-tint-info text-info",
  /*
    ORANGE, and it is the only one that gets it besides `in_progress` — an animal
    that has arrived and is waiting is a human-must-act if anything is.
  */
  arrived: "bg-tint-warning text-warning",
  in_progress: "bg-secondary text-secondary-foreground",
  completed: "bg-success/12 text-success",
  delivery: "bg-tint-info text-info",
  /* The visit is over and it ended well — the deepest green on the list. */
  return_to_pawrents: "bg-success/12 text-success",
  cancelled: "bg-muted/40 text-muted",
  rescheduled: "bg-muted/40 text-muted",
};

/** Every coloured badge carries a word — ui-rules §1.3. */
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", STATUS_STYLES[status])}
    >
      {BOOKING_STATUS_LABELS[status]}
    </Badge>
  );
}
