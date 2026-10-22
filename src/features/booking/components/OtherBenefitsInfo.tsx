"use client";

import { CheckRow, CheckRowGroup } from "@/components/form";
import type { PlannedExtra } from "@/types/api";

import { hasExtra, toggleExtra, type OtherBenefitsGroup } from "../otherBenefits";

/**
 * "Benefit lain dari {paket}" on a booking card — the animal's card benefits a
 * booking cannot bill (`otherBenefitsOf`): product benefits, said to be used at
 * the till, and perks. Draws nothing when there is nothing to list.
 *
 * ─── EACH LINE IS A CHECKBOX (22 October 2026) ─────────────────────────────
 *
 * Ticking one means "benefit yang akan diberikan di kunjungan ini" — a NOTE
 * saved on the booking (`plannedExtras`) so the groomer and the cashier know
 * what was promised at the counter. It does NOT consume a jatah and does not
 * change the price: a product benefit is still applied at the till. Several
 * may be ticked. Without `onChange` the box is read-only (lines, no boxes).
 *
 * LEGIBLE, NOT MUTED: it is now something a receptionist acts on, so it reads
 * like the other cards of the form — a small heading, foreground text, `p-4`.
 */
export function OtherBenefitsInfo({
  groups,
  selected = [],
  onChange,
  disabled = false,
}: {
  groups: readonly OtherBenefitsGroup[];
  /** The ticked benefits of this booking. */
  selected?: readonly PlannedExtra[];
  /** The whole new set after a tick — absent draws the list read-only. */
  onChange?: (next: PlannedExtra[]) => void;
  disabled?: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <div data-other-benefits className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.key} className="rounded-lg border border-border bg-background p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Benefit lain dari {group.planName}
          </h4>
          {onChange ? (
            <>
              {/* A paused or unpaid card: listed, greyed, and said why. */}
              {group.blocked ? (
                <p className="mt-1 text-sm font-medium text-warning">{group.blocked}</p>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Centang yang akan diberikan di kunjungan ini — hanya catatan, jatah tidak
                  terpotong.
                </p>
              )}
              <CheckRowGroup className="mt-1">
                {group.lines.map((line) => (
                  <CheckRow
                    key={`${line.membershipId}-${line.benefitId}`}
                    label={line.text}
                    checked={hasExtra(selected, line)}
                    disabled={disabled || Boolean(group.blocked)}
                    onCheckedChange={(checked) => onChange(toggleExtra(selected, line, checked))}
                    className="py-3"
                  />
                ))}
              </CheckRowGroup>
            </>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-foreground">
              {group.lines.map((line) => (
                <li key={`${line.membershipId}-${line.benefitId}`}>{line.text}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
