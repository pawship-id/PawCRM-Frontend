"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import type { BenefitCandidate } from "@/types/membership";
import { formatMoney, isPositive, sumDecimals } from "@/utils/decimal";

import { candidateKey, type CardBenefitView } from "../benefitQuote";

/**
 * "Benefit membership" on a booking card — one radio row per benefit that
 * covers this animal's service on the booking's date, plus "Tanpa member".
 *
 * ─── THE ROWS COME FROM THE SERVER'S QUOTE, NOT FROM THE CARD ──────────────
 *
 * It used to read the animal's cards and match the scope by service id, which
 * offered a benefit whose jatah was already gone, or held by another booking,
 * or on a paused card. The quote (membership-v1 §4.4) knows all of that for the
 * booking's own date and period, so each row says what it would be worth —
 * "Jatah Grooming 1/3 · −Rp 100.000" — and a benefit that cannot be used says
 * why instead of disappearing.
 *
 * ─── A CHOICE IS A HOLD ────────────────────────────────────────────────────
 *
 * Since Promosi V1 a saved choice HOLDS the jatah until the booking is billed or
 * cancelled — another booking in the same period sees it as used. The one-line
 * note under a quota pick says exactly that, because "already deducted" and
 * "not touched until the till" were both wrong answers to the customer.
 *
 * ─── IT DRAWS NOTHING WHEN THE ANIMAL HOLDS NO CARD ────────────────────────
 *
 * `view.show` is false then. A permanently empty section on every booking card
 * would be a control that never works.
 */
export function BookingBenefitField({
  view,
  disabled = false,
  error = null,
  onPick,
}: {
  view: CardBenefitView;
  disabled?: boolean;
  /** The server refused this card's benefit on save (§8). */
  error?: string | null;
  /** A candidate, or `null` for "Tanpa member". */
  onPick: (candidate: BenefitCandidate | null) => void;
}) {
  const labelId = useId();

  if (!view.show) return null;

  const selected =
    view.candidates.find((candidate) => candidateKey(candidate) === view.selectedKey) ?? null;

  return (
    <div className="mt-3">
      <p id={labelId} className="text-xs font-medium text-muted">
        Benefit membership
      </p>

      {view.candidates.length === 0 ? (
        <p
          data-benefit-empty
          className="mt-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-muted"
        >
          {view.emptyMessage}
        </p>
      ) : (
        <div role="radiogroup" aria-labelledby={labelId} className="mt-1 flex flex-col gap-2">
          {view.candidates.map((candidate) => {
            const off = sumDecimals([candidate.discount, candidate.visitFeeDiscount ?? "0"]);
            return (
              <OptionRow
                key={candidateKey(candidate)}
                checked={view.selectedKey === candidateKey(candidate)}
                disabled={disabled}
                title={candidate.label}
                source={[candidate.benefitLabel, candidate.planName].filter(Boolean).join(" · ")}
                amount={isPositive(off) ? `−${formatMoney(off)}` : null}
                onSelect={() => onPick(candidate)}
              />
            );
          })}
          <OptionRow
            checked={view.selectedKey === null}
            disabled={disabled}
            title="Tanpa member"
            source="Harga normal"
            amount={null}
            onSelect={() => onPick(null)}
          />
        </div>
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

/** One radio row: what it is, where it comes from, what it takes off. */
function OptionRow({
  checked,
  disabled,
  title,
  source,
  amount,
  onSelect,
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  source: string;
  amount: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg border-[1.5px] px-3 py-2 text-left transition",
        "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-primary bg-navy-100" : "border-border bg-surface hover:bg-surface-hover",
      )}
    >
      {/* The dot is drawn, not a real input: the button IS the radio. */}
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
          checked ? "border-primary" : "border-muted",
        )}
      >
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {source && <span className="block text-xs text-muted">{source}</span>}
      </span>
      {amount && (
        <span className="shrink-0 text-sm font-semibold tabular-nums text-success">{amount}</span>
      )}
    </button>
  );
}
