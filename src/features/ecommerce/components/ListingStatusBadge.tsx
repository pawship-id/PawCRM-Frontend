import { cn } from "@/lib/utils";
import type { ListingStatus } from "@/types/marketplace";

import { LISTING_STATUS_LABEL, LISTING_STATUS_TONE } from "../labels";

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        LISTING_STATUS_TONE[status],
      )}
    >
      {LISTING_STATUS_LABEL[status]}
    </span>
  );
}
