"use client";

import { VariantChoicePicker } from "@/features/services";
import type { VariantChoice, VariantOption } from "@/types/api";

import type { LineRefusal } from "../variantLine";

/**
 * A typed service line's price BEYOND THE PET, on the row itself (17 September
 * 2026): the "Dipilih staf" selects the line's service declares, the customer's
 * zone when it varies by Zona, and — when the quote cannot be made — why.
 *
 * Shared by Faktur baru and the invoice editor. Nothing is drawn for a line
 * whose service asks none of these, so an ordinary grooming row is unchanged.
 */
export function InvoiceLineVariant({
  cards,
  choices,
  onChange,
  zoneText,
  problem,
  refusal,
  disabled,
}: {
  /** The cards this row asks — `useVariantQuote().cardsFor(...)`. */
  cards: VariantOption[];
  choices: readonly VariantChoice[];
  onChange: (next: VariantChoice[]) => void;
  /** The zone line — only when the service varies by Zona. */
  zoneText: string | null;
  /** `problemOf(...)` for this row's quote, when it has one to say. */
  problem: string | null;
  /** The server's refusal for this row, from the last save. */
  refusal: LineRefusal | null;
  disabled?: boolean;
}) {
  const refusalOnCard =
    refusal?.optionId !== undefined &&
    cards.some((card) => card.axisKey === refusal.optionId);

  /* The zone line is the problem's own subject — said once, as the problem. */
  const showZone = zoneText !== null && problem === null;

  if (cards.length === 0 && !showZone && !problem && !refusal) return null;

  return (
    <div className="mt-2 flex min-w-56 flex-col gap-1.5">
      <VariantChoicePicker
        cards={cards}
        value={choices}
        onChange={onChange}
        disabled={disabled}
        errorFor={(optionId) =>
          refusalOnCard && refusal?.optionId === optionId ? refusal.message : undefined
        }
      />
      {showZone && (
        <span className="block text-xs text-muted tabular-nums">{zoneText}</span>
      )}
      {problem && (
        <span className="block text-xs font-semibold text-danger-ink">{problem}</span>
      )}
      {refusal && !refusalOnCard && refusal.message !== problem && (
        <span role="alert" className="block text-xs font-semibold text-danger-ink">
          {refusal.message}
        </span>
      )}
    </div>
  );
}
