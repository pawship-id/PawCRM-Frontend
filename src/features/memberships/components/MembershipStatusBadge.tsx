import type { MembershipStatus } from "@/types/membership";

import { STATUS_LABEL, STATUS_TONE } from "../labels";

/**
 * A card's state, as a word with a tint behind it.
 *
 * THE WORD IS NOT OPTIONAL (ui-rules §1.3): status is never communicated by
 * colour alone. The tint only reinforces what the label already says.
 */
export function MembershipStatusBadge({
  status,
  className = "",
}: {
  status: MembershipStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${STATUS_TONE[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
