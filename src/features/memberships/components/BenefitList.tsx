import type { BenefitAvailability, MembershipBenefit } from "@/types/membership";

import { REASON_LABEL, formatDate, remainingLabel } from "../labels";

/**
 * A card's benefits, with what is left of each.
 *
 * ─── AN EXHAUSTED BENEFIT IS DIMMED, NEVER HIDDEN ──────────────────────────
 *
 * "Sudah dipakai minggu ini" is precisely the answer the person at the counter
 * came to find. A benefit that quietly disappeared from the list leaves them
 * with no answer at all, and the owner convinced the card has stopped working.
 * Dimming says "this is yours, and it is spent"; absence says nothing.
 *
 * ─── AND IT SAYS WHEN IT COMES BACK ────────────────────────────────────────
 *
 * `nextAvailableAt` is the sentence that makes a weekly quota comprehensible —
 * "bisa lagi Senin, 5 Okt" rather than an arithmetic exercise. The server
 * clamps it to the card's own expiry and leaves it null when the LIFETIME quota
 * is what ran out, so this component can print it whenever it is there without
 * ever promising a week the card will not live to see.
 */
export function BenefitList({
  benefits,
}: {
  /**
   * `BenefitAvailability` on a real card; plain `MembershipBenefit` in the
   * catalogue, where nothing has been spent yet and there are no counters.
   */
  benefits: (BenefitAvailability | MembershipBenefit)[];
}) {
  if (!benefits.length) {
    return (
      <p className="text-sm text-muted">
        Paket ini tidak memberi benefit apa pun.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {benefits.map((benefit) => {
        const live = "available" in benefit ? benefit : null;
        const spent = live !== null && !live.available;

        return (
          <li key={benefit.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p
                className={`text-sm font-medium ${spent ? "text-muted" : "text-foreground"}`}
              >
                {benefit.label}
              </p>

              {live ? (
                <p className={`text-sm ${spent ? "text-muted" : "text-foreground"}`}>
                  {spent && live.reason
                    ? REASON_LABEL[live.reason]
                    : remainingLabel(live)}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {"summary" in benefit ? benefit.summary : ""}
                </p>
              )}
            </div>

            {live && spent && live.nextAvailableAt && (
              <p className="text-sm text-muted">
                Bisa dipakai lagi mulai {formatDate(live.nextAvailableAt)}.
              </p>
            )}

            {live && !spent && live.kind === "perk" && (
              <p className="text-sm text-muted">
                Fasilitas — tidak memotong harga.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
