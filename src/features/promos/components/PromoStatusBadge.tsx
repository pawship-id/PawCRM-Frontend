import { ToneBadge } from "@/features/memberships";
import type { Promo } from "@/types/promo";

import { PROMO_STATUS_TONE, promoStatusLabel } from "../labels";

/** A promo's status as a word on a tint (ui-rules §9) — never colour alone. */
export function PromoStatusBadge({ promo }: { promo: Pick<Promo, "status" | "stoppedAt"> }) {
  return <ToneBadge tone={PROMO_STATUS_TONE[promo.status]} label={promoStatusLabel(promo)} />;
}
