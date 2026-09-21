import { cn } from "@/lib/utils";
import type { CommissionStatus } from "@/types/api";

import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_TONE } from "../labels";

/**
 * One commission row's status — pale tint, saturated ink, always the word (§9).
 * A local badge until `StatusBadge` is built; the tones are the spec's.
 */
export function CommissionStatusBadge({
  status,
  className,
}: {
  status: CommissionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        COMMISSION_STATUS_TONE[status],
        className,
      )}
    >
      {COMMISSION_STATUS_LABEL[status]}
    </span>
  );
}
