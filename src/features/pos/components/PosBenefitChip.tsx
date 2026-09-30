"use client";

import { Sparkles } from "lucide-react";

/**
 * The mark on a cart line a membership card paid for.
 *
 * ─── IT NO LONGER OFFERS ONE (30 September 2026, on request) ───────────────
 *
 * It used to have a second state: a "Pakai benefit −Rp …" button on any line a
 * card could pay for. Choosing moved to `PosBenefitSection`, under Diskon
 * keranjang, because a per-row offer could only show what happened to MATCH —
 * a customer holding four benefits saw one button and no sign the other three
 * existed. What is left here is the INDICATOR, which still belongs on the row:
 * the section says what was spent, the row says what it was spent on.
 *
 * ─── IT IS NOT AN EDITABLE DISCOUNT ────────────────────────────────────────
 *
 * There is no amount to type. The figure comes from the card's frozen plan, and
 * the cashier's only decision is whether to honour it — so the control is a
 * toggle, never a popover. Changing what an entitlement is worth at the counter
 * is precisely what this must not allow.
 */
export function PosBenefitChip({
  applied,
}: {
  /** What the line already carries, from `item.discount`. */
  applied: { benefitLabel: string | null; amount: string } | null;
}) {
  if (applied) {
    /*
      ─── A MARK, NOT A CONTROL (1 October 2026, on request) ──────────────────

      It carried a ✕ that took the benefit off. Removing now happens ONLY in
      the Benefit membership section, so the chip is plain text: one place
      decides what is spent, and the row reports it.

      Its ✕ was also the only thing making the chip tall enough to push the row
      around — see the note below on the name and the amount.
    */
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-success-fill px-2 py-0.5 text-xs font-medium text-foreground"
        title={applied.benefitLabel ?? undefined}
      >
        <Sparkles className="size-3 shrink-0" aria-hidden />
        Benefit membership
      </span>
    );
  }

  /* Nothing applied — nothing to say. Offering one is the section's job now. */
  return null;
}
