"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BADGE_CLASS, TONE_CLASS } from "@/features/memberships/labels";
import { cn } from "@/lib/utils";
import type { PosItem } from "@/types/api";
import type { BenefitQuoteLineResult } from "@/types/membership";
import type { PromoQuoteLine } from "@/types/promo";

import { matchesBooking, pickOf, unavailableChips } from "../membershipCart";
import {
  potonganChange,
  potonganOptions,
  potonganValue,
  promoOptionLabel,
  toneOfValue,
  type PotonganChange,
} from "../promoCart";

/**
 * THE "POTONGAN" PICK ON ONE LINE (Promosi V1, widened for Promo V1 on
 * 8 November 2026) — one compact select: the card's benefits (Jatah /
 * Member), the promos that cover the line, and "Tanpa potongan".
 *
 * The till already put the best combination on the line (member auto-apply,
 * plus the server's automatic promo), so the cashier's only decision is "a
 * different one" or "none". Each option names the source in words —
 * "Jatah …", "Member · …", "Promo · …" — and the trigger is tinted by what
 * is chosen: success for a card, info for a promo (ui-rules §9: a word on
 * every tint, never colour alone).
 *
 * A "bisa digabung" promo riding on a member benefit is said beside the
 * select as its own small "Promo · …" badge.
 *
 * THE SERVER PRICES IT. Choosing sends ids; the figure on the row is the
 * server's line total after the next write.
 */
export function PosBenefitSelect({
  item,
  line,
  promoLine,
  promosAllowed = true,
  disabled = false,
  onChange,
}: {
  item: PosItem;
  /** The member quote's answer for this line, or null while none is current. */
  line: BenefitQuoteLineResult | null;
  /** The promo quote's answer for this line, or null. */
  promoLine?: PromoQuoteLine | null;
  /** False offline — no promo is offered there at all. */
  promosAllowed?: boolean;
  disabled?: boolean;
  onChange: (change: PotonganChange) => void;
}) {
  const pick = pickOf(item);
  const chips = unavailableChips(line);
  const byBooking = matchesBooking(item);
  const options = potonganOptions(item, line, promoLine ?? null, { promosAllowed });
  const value = potonganValue(item);
  const tone = toneOfValue(value);
  /* Promos riding on the card — only "bisa digabung" ones can. */
  const riding = pick && promosAllowed ? (item.promos ?? []) : [];

  /* Nothing to choose between: only "Tanpa potongan" and no chip to say. */
  if (options.length <= 1 && chips.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {options.length > 1 && (
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === value) return;
            const change = potonganChange(next, line);
            if (change) onChange(change);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Potongan untuk ${item.name}`}
            className={cn(
              "max-w-full min-w-0 text-xs",
              tone === "member" && "border-transparent bg-tint-success font-medium text-success",
              tone === "promo" && "border-transparent bg-tint-info font-medium text-info",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {riding.map((promo) => (
        <span key={String(promo.promoId)} className={cn(BADGE_CLASS, TONE_CLASS.info)}>
          {promoOptionLabel(promo)}
        </span>
      ))}

      {chips.map((chip) => (
        <span key={chip} className={cn(BADGE_CLASS, TONE_CLASS.neutral)}>
          {chip}
        </span>
      ))}

      {byBooking && <span className="text-xs text-muted">sesuai booking</span>}
    </div>
  );
}
