import { Badge } from "@/components/ui/badge";
import type { PurchaseReturnStatus } from "@/types/api";

/**
 * Where a return is in its life.
 *
 * TWO STATES, AND ONLY TWO, exactly as a stock opname has — and the colours say
 * which way is forward. A draft is neutral: it is a list somebody is assembling
 * while the boxes are on the floor, nothing has moved and nothing is at stake. A
 * submitted return is green not because sending goods back is good news but
 * because it is DONE — the stock has left, the weighted average has been reversed
 * at the original purchase price, and the supplier's payable has been reduced.
 *
 * "final" rather than "submitted" in the label, matching OpnameStatusBadge. The
 * API's word describes the request that happened; a user needs the word that
 * describes what it means for them — that this one can no longer be changed, and
 * a correction now means receiving the goods back in.
 */
export function PurchaseReturnStatusBadge({
  status,
}: {
  status: PurchaseReturnStatus;
}) {
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
