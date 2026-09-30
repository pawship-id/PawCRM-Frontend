"use client";

import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { BenefitCandidate } from "@/types/membership";

/**
 * "Pakai benefit" on an invoice line — one click to apply, one to remove.
 *
 * ─── A SEPARATE COMPONENT FROM THE TILL'S, ON PURPOSE ──────────────────────
 *
 * `PosBenefitChip` sits in a 44px-tall cart row on a touch screen; this sits in
 * a dense table cell under a discount field. Sharing one component would mean a
 * `size` prop and two layouts inside it, which is how a shared component starts
 * serving neither caller. What they DO share is the only thing that matters —
 * the candidate the server quoted, and the rule that the amount is never typed.
 *
 * ─── IT DRAWS NOTHING WHEN THERE IS NOTHING TO OFFER ───────────────────────
 *
 * No card, no match, or no quota left: blank. Why a benefit is unavailable is a
 * question for the pet profile, where somebody is asking it; on a bill being
 * typed the only useful signal is that one IS available.
 */
export function InvoiceBenefitChip({
  applied,
  offer,
  disabled = false,
  onApply,
  onRemove,
}: {
  applied: { benefitId: string; amount: string } | null;
  offer: BenefitCandidate | null;
  disabled?: boolean;
  onApply: (candidate: BenefitCandidate) => void;
  onRemove: () => void;
}) {
  if (applied) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-fill py-0.5 pl-2 pr-0.5 text-xs font-medium text-foreground">
        <Sparkles className="size-3" aria-hidden />
        Benefit −{formatMoney(applied.amount)}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Lepas benefit membership"
        >
          <X className="size-3" aria-hidden />
        </Button>
      </span>
    );
  }

  if (!offer) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="mt-1 h-8"
      disabled={disabled}
      onClick={() => onApply(offer)}
      /* The card is named here because the button has room only for the saving. */
      title={`${offer.planName ?? "Membership"} · ${offer.membershipNumber} — ${offer.benefitLabel}`}
    >
      <Sparkles className="size-3.5" aria-hidden />
      Pakai benefit −{formatMoney(offer.discount)}
    </Button>
  );
}
