import type { MembershipStatus } from "@/types/membership";

import {
  BADGE_CLASS,
  EXPIRING_SOON_LABEL,
  EXPIRING_SOON_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  TONE_CLASS,
  type BadgeTone,
} from "../labels";

/**
 * A card's state, as a word with a tint behind it.
 *
 * THE WORD IS NOT OPTIONAL (ui-rules §1.3): status is never communicated by
 * colour alone. The tint only reinforces what the label already says.
 *
 * `expiringSoon` overrides the label of an `active` card with "Segera
 * berakhir" — the same card, read as the renewal it is about to need.
 */
export function MembershipStatusBadge({
  status,
  expiringSoon = false,
  className = "",
}: {
  status: MembershipStatus;
  expiringSoon?: boolean;
  className?: string;
}) {
  const soon = expiringSoon && status === "active";

  return (
    <ToneBadge
      tone={soon ? EXPIRING_SOON_TONE : STATUS_TONE[status]}
      label={soon ? EXPIRING_SOON_LABEL : STATUS_LABEL[status]}
      className={className}
    />
  );
}

/**
 * The module's one badge — pale `bg-tint-*` fill, saturated ink, no border
 * (ui-rules §9). `label` is a required string: status is never colour alone.
 */
export function ToneBadge({
  tone,
  label,
  className = "",
}: {
  tone: BadgeTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={`${BADGE_CLASS} ${TONE_CLASS[tone]} ${className}`}>
      {label}
    </span>
  );
}
