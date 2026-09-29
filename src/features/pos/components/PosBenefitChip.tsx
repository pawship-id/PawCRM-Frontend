"use client";

import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { BenefitCandidate } from "@/types/membership";

/**
 * "Pakai benefit" on a cart line — one click to apply, one to remove.
 *
 * ─── THREE STATES, AND ONLY TWO OF THEM DRAW ANYTHING ──────────────────────
 *
 *   applied   — the line already carries a benefit. A removable pill naming it.
 *   offered   — a card could pay for this line. A button saying what it saves.
 *   nothing   — no card, no match, or the quota is gone. Draws NOTHING.
 *
 * THE THIRD STATE IS BLANK ON PURPOSE. A disabled "Pakai benefit" on every
 * shampoo in the shop would be a control that never works, on a screen where
 * every pixel is read at speed. Why a benefit is unavailable belongs on the pet
 * profile, where somebody is asking that question; at the till the only useful
 * signal is that one IS available.
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
  offer,
  disabled = false,
  onApply,
  onRemove,
}: {
  /** What the line already carries, from `item.discount`. */
  applied: { benefitLabel: string | null; amount: string } | null;
  /** What the server says could be applied, from the cart quote. */
  offer: BenefitCandidate | null;
  disabled?: boolean;
  onApply: (candidate: BenefitCandidate) => void;
  onRemove: () => void;
}) {
  if (applied) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-fill py-0.5 pl-2.5 pr-0.5 text-sm font-medium text-foreground">
        <Sparkles className="size-3.5" aria-hidden />
        {applied.benefitLabel ?? "Benefit"} −{formatMoney(applied.amount)}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Lepas benefit ${applied.benefitLabel ?? ""}`.trim()}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </span>
    );
  }

  if (!offer) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-9"
      disabled={disabled}
      onClick={() => onApply(offer)}
      /*
        THE TITLE NAMES THE CARD, because a customer with two packages needs to
        know which one is about to be spent — and the button itself has room
        only for the benefit and the saving.
      */
      title={`${offer.planName ?? "Membership"} · ${offer.membershipNumber}`}
    >
      <Sparkles className="size-4" aria-hidden />
      Pakai benefit −{formatMoney(offer.discount)}
    </Button>
  );
}
