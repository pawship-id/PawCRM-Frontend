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
import type { PosBenefitPick, PosItem } from "@/types/api";
import type { BenefitQuoteLineResult } from "@/types/membership";

import {
  candidateKey,
  candidateOptionLabel,
  candidatePick,
  matchesBooking,
  pickKey,
  pickOf,
  unavailableChips,
} from "../membershipCart";

/** Radix Select forbids `value=""`, so "Tanpa member" needs a value of its own. */
const NONE = "none";

/**
 * THE MEMBER PICK ON ONE LINE (Promosi V1) — replaces the old Pakai/Lepas
 * section under Diskon keranjang.
 *
 * A COMPACT SELECT, not buttons: the quote already put its best pick on the
 * line (auto-apply), so the cashier's only decision is "a different one" or
 * "Tanpa member". Each option names the benefit only — "Jatah Grooming
 * 2/3", "Member · Diskon 10%"; the struck price on the row shows the amount.
 *
 * SUCCESS TONE while a pick is on the line, so a basket read at speed shows
 * which rows a card is paying for.
 *
 * Benefits that would cover the line but cannot be used appear as short muted
 * chips ("Grooming habis", "Member ditunda") — said, never hidden.
 *
 * THE SERVER PRICES IT. Choosing sends ids; the figure on the row is the
 * server's line total after the next write.
 */
export function PosBenefitSelect({
  item,
  line,
  disabled = false,
  onChange,
}: {
  item: PosItem;
  /** The quote's answer for this line, or null while none is current. */
  line: BenefitQuoteLineResult | null;
  disabled?: boolean;
  onChange: (pick: PosBenefitPick | null) => void;
}) {
  const pick = pickOf(item);
  const candidates = line?.candidates ?? [];
  const chips = unavailableChips(line);
  const byBooking = matchesBooking(item);

  /*
    THE PICK ON THE LINE MAY NOT BE AMONG THE CANDIDATES — a same-cart package
    (whose virtual id is never pinned), or a quote still in flight. It is kept
    as an option of its own so the select never reads "Tanpa member" over a
    line a card is paying for.
  */
  const pickedCandidate = pick
    ? candidates.find((candidate) => candidateKey(candidate) === pickKey(pick))
    : undefined;
  const value = pick ? pickKey(pick) : NONE;

  if (candidates.length === 0 && !pick && chips.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {(candidates.length > 0 || pick) && (
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === value) return;
            if (next === NONE) return onChange(null);
            const chosen = candidates.find((candidate) => candidateKey(candidate) === next);
            if (chosen) onChange(candidatePick(chosen));
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Member untuk ${item.name}`}
            className={cn(
              "max-w-full min-w-0 text-xs",
              pick && "border-transparent bg-tint-success font-medium text-success",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidateKey(candidate)} value={candidateKey(candidate)}>
                {candidateOptionLabel(candidate)}
              </SelectItem>
            ))}
            {pick && !pickedCandidate && (
              <SelectItem value={pickKey(pick)}>
                {item.discount?.benefitLabel ?? "Member"}
              </SelectItem>
            )}
            <SelectItem value={NONE}>Tanpa member</SelectItem>
          </SelectContent>
        </Select>
      )}

      {chips.map((chip) => (
        <span key={chip} className={cn(BADGE_CLASS, TONE_CLASS.neutral)}>
          {chip}
        </span>
      ))}

      {byBooking && <span className="text-xs text-muted">sesuai booking</span>}
    </div>
  );
}
