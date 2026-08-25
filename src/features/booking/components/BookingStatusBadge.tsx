import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/api";

/**
 * Indonesian labels for the five statuses. The visible word is copy, not the
 * API's value — ui-rules §12.
 */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Draf",
  confirmed: "Dikonfirmasi",
  in_progress: "Sedang dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

/**
 * The tint per status. Orange is reserved for the one that means A HUMAN MUST
 * ACT — an animal on the table right now — because ui-rules §4 gives it exactly
 * that meaning and spends it nowhere else.
 */
const STATUS_STYLES: Record<BookingStatus, string> = {
  draft: "bg-muted/40 text-muted",
  confirmed: "bg-navy-100 text-primary",
  in_progress: "bg-secondary text-secondary-foreground",
  completed: "bg-success/12 text-success",
  cancelled: "bg-muted/40 text-muted",
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
