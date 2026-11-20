"use client";

import { BadgeCheck, Ban, Tag } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { unavailableChips } from "@/features/pos/membershipCart";
import {
  potonganChange,
  potonganOptions,
  potonganValue,
  promoOptionLabel,
  toneOfValue,
  type PotonganChange,
  type PotonganItem,
} from "@/features/pos/promoCart";
import { BADGE_CLASS, TONE_CLASS } from "@/features/memberships/labels";
import { cn } from "@/lib/utils";
import { formatMoney, isPositive } from "@/utils/decimal";
import type { BenefitQuoteLineResult } from "@/types/membership";
import type { PromoQuoteLine } from "@/types/promo";

/**
 * THE "POTONGAN" PICK ON ONE FAKTUR ROW (20 November 2026) — the till's
 * `PosBenefitSelect`, with the same options and the same writes: the card's
 * benefits (Jatah / Member), the promos with the "Faktur" channel ticked that
 * cover the row, and "Tanpa potongan". The form already put the best
 * combination on (auto-apply + the automatic promo); choosing here is "a
 * different one" or "none".
 *
 * ─── ONE TIDY LINE UNDER THE DISCOUNT INPUT (20 November 2026) ───────────
 *
 * A compact pill — tinted by kind, with an icon, truncated when the promo's
 * name runs long — and the row's whole cut ("−Rp …", `off`) right-aligned on
 * the same line. It used to be a second input-sized box under a separate
 * "−Rp" line, which read as two more fields to fill in.
 */
export function InvoicePotonganSelect({
  name,
  item,
  memberLine,
  promoLine,
  disabled = false,
  off = null,
  onChange,
}: {
  /** The row's name, for the control's accessible label. */
  name: string;
  item: PotonganItem;
  memberLine: BenefitQuoteLineResult | null;
  promoLine: PromoQuoteLine | null;
  disabled?: boolean;
  /** What the preview takes off the row — shown at the line's right. */
  off?: string | null;
  onChange: (change: PotonganChange) => void;
}) {
  const options = potonganOptions(item, memberLine, promoLine);
  const value = potonganValue(item);
  const tone = toneOfValue(value);
  const chips = unavailableChips(memberLine);
  /* Promos riding on the card — only "bisa digabung" ones can. */
  const riding = item.benefit ? (item.promos ?? []) : [];

  const showOff = Boolean(off && isPositive(off));
  const Icon = tone === "member" ? BadgeCheck : tone === "promo" ? Tag : Ban;

  /* Nothing to choose between, no chip to say, no cut to show. */
  if (options.length <= 1 && chips.length === 0 && !showOff) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex min-w-0 items-center justify-between gap-2">
        {options.length > 1 ? (
          <Select
            value={value}
            disabled={disabled}
            onValueChange={(next) => {
              if (next === value) return;
              const change = potonganChange(next, memberLine, promoLine);
              if (change) onChange(change);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={`Potongan untuk ${name}`}
              className={cn(
                "data-[size=sm]:h-7 max-w-full min-w-0 gap-1 rounded-full px-2.5 py-0 text-xs font-medium shadow-none",
                "*:data-[slot=select-value]:block *:data-[slot=select-value]:truncate",
                tone === "member" && "border-transparent bg-tint-success text-success",
                tone === "promo" && "border-transparent bg-tint-info text-info",
                tone === "none" && "border-border bg-surface text-muted",
                "[&_svg:not([class*='text-'])]:text-current",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
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
        ) : (
          <span />
        )}

        {showOff && (
          <span className="shrink-0 text-xs font-medium text-success tabular-nums">
            −{formatMoney(off as string)}
          </span>
        )}
      </div>

      {(riding.length > 0 || chips.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {riding.map((part) => (
            <span key={String(part.promoId)} className={cn(BADGE_CLASS, TONE_CLASS.info)}>
              {promoOptionLabel(part)}
            </span>
          ))}
          {chips.map((chip) => (
            <span key={chip} className={cn(BADGE_CLASS, TONE_CLASS.neutral)}>
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
