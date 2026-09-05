import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/api";

/**
 * Indonesian labels for the six statuses, in the order a booking walks them. The visible word is copy, not the
 * API's value — ui-rules §12.
 */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Draf",
  /* Written down and asked for; the shop has not agreed yet. */
  requested: "Diminta",
  confirmed: "Dikonfirmasi",
  /* The van is out. Only on a booking that asked to be fetched. */
  pickup: "Dijemput",
  /* The animal is at the shop. `check_in` renamed — the word people use. */
  arrived: "Sudah datang",
  in_progress: "Sedang dikerjakan",
  completed: "Selesai dikerjakan",
  /* The van has left with it. Only on a booking that asked to be taken home. */
  delivery: "Diantar pulang",
  return_to_pawrents: "Sudah dijemput pemilik",
  cancelled: "Dibatalkan",
  /*
    A TRAIL ENTRY, NOT A STATE. No booking is ever in it — the label exists
    because the history card renders whatever the trail holds, and the one place
    this word appears is there.
  */
  rescheduled: "Dijadwalkan ulang",
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
