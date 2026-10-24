"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BenefitCandidate } from "@/types/membership";

import { candidateKey, type CardBenefitView } from "../benefitQuote";
import { AddonMemberToggle } from "./AddonMemberToggle";

/** Radix Select forbids `value=""`, so "Tanpa member" needs a value of its own. */
const NONE = "none";

/**
 * THE MAIN SERVICE'S MEMBER BENEFIT, ON ITS OWN PRICE ROW (22 October 2026) —
 * the same place and the same words as an add-on's: the benefit's name under
 * the struck Efektif, and a way to switch it off.
 *
 * ─── IT USED TO BE A RADIO CARD LIST ───────────────────────────────────────
 *
 * "Benefit membership" drew one bordered row per candidate plus "Tanpa
 * member", below the price. It said the same amount twice (the row and the
 * struck price) and pushed the add-ons a screen down. Now:
 *
 *   - ONE candidate — its name, and the text button "Tanpa member" (or, once
 *     switched off, "Tanpa member" and "Pakai member"), the add-on's toggle.
 *   - MORE THAN ONE — the name IS a compact select, the till's
 *     `PosBenefitSelect`: the candidates by name (no amounts — the struck
 *     price already says how much) and "Tanpa member".
 *   - NONE, but the card covers the service (jatah habis, dipesan booking
 *     lain, ditunda) — the server's sentence, muted, instead.
 *
 * ─── THE ROWS COME FROM THE SERVER'S QUOTE, NOT FROM THE CARD ──────────────
 *
 * The quote (membership-v1 §4.4) knows the scope, the holds of other bookings
 * and the period of the booking's own date. What this shows is what the save
 * sends as `plannedBenefit` — and, since Promosi V1, HOLDS: the one-line note
 * under a quota pick says so.
 *
 * ─── IT DRAWS NOTHING WHEN THERE IS NOTHING TO SAY ─────────────────────────
 *
 * No card, or a card that covers nothing on this service: the row stays a
 * plain price row. What the card holds beyond the booking is the per-animal
 * "Benefit lain" box (`OtherBenefitsInfo`).
 */
export function BookingBenefitField({
  view,
  serviceName,
  disabled = false,
  error = null,
  onPick,
}: {
  view: CardBenefitView;
  /** For the controls' accessible names — "Tanpa member untuk Grooming". */
  serviceName: string;
  disabled?: boolean;
  /** The server refused this card's benefit on save (§8). */
  error?: string | null;
  /** A candidate, or `null` for "Tanpa member". */
  onPick: (candidate: BenefitCandidate | null) => void;
}) {
  const candidates = view.show ? view.candidates : [];
  const selected =
    candidates.find((candidate) => candidateKey(candidate) === view.selectedKey) ?? null;
  const unavailable = view.show && candidates.length === 0 ? view.emptyMessage : null;

  if (candidates.length === 0 && !unavailable && !error) return null;

  const only = candidates.length === 1 ? candidates[0] : null;

  return (
    <div data-main-member className="mt-2">
      {candidates.length > 1 && (
        <Select
          value={selected ? candidateKey(selected) : NONE}
          disabled={disabled}
          onValueChange={(next) => {
            if (next === NONE) return onPick(null);
            const chosen = candidates.find((candidate) => candidateKey(candidate) === next);
            if (chosen) onPick(chosen);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Member untuk ${serviceName}`}
            className={cn(
              "max-w-full min-w-0 text-xs",
              selected && "border-transparent bg-tint-success font-medium text-success",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidateKey(candidate)} value={candidateKey(candidate)}>
                {candidate.label}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>Tanpa member</SelectItem>
          </SelectContent>
        </Select>
      )}

      {only && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          {selected ? (
            <span className="font-semibold text-success">{only.label}</span>
          ) : (
            <span className="text-muted">Tanpa member</span>
          )}
          <AddonMemberToggle
            optedOut={!selected}
            addonName={serviceName}
            disabled={disabled}
            onToggle={(optOut) => onPick(optOut ? null : only)}
          />
        </p>
      )}

      {unavailable && (
        <p data-benefit-unavailable className="text-xs text-muted">
          {unavailable}
        </p>
      )}

      {selected?.kind === "quota" && (
        <p className="mt-1 text-xs text-muted">
          Jatah ditahan sampai booking dibayar atau dibatalkan.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
