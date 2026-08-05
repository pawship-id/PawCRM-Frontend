import { Badge } from "@/components/ui/badge";

/**
 * Where a count sheet is in its life.
 *
 * TWO STATES, AND THE COLOURS SAY WHICH WAY IS FORWARD. A draft is neutral —
 * work in progress, nothing has moved, nothing is at stake. A submitted sheet is
 * green not because it found no problems but because it is DONE: the differences
 * are in the ledger and the sheet can no longer change.
 *
 * "final" rather than "submitted" in the label, deliberately. The API's word
 * describes the request that happened; a user needs the word that describes what
 * it means for them — that this one is closed and a correction now means
 * counting again.
 */
export function OpnameStatusBadge({ status }: { status: "draft" | "submitted" }) {
  if (status === "submitted") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-success/12 text-success"
      >
        final
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-transparent bg-secondary/25 text-secondary-foreground"
    >
      draft
    </Badge>
  );
}
