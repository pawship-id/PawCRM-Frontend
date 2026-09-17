"use client";

import { SelectField } from "@/components";
import type { VariantChoice, VariantOption } from "@/types/api";

/**
 * One select per "Dipilih staf" card a line's services declare — "Lokasi: Di
 * Rumah" (17 September 2026). Used by booking, till and invoice alike.
 *
 * `value` is the line's choices; `onChange` hands back the whole list with one
 * card's value replaced. A retired value the line already holds is still
 * offered, marked "(nonaktif)", so an edit does not silently drop it.
 */
export function VariantChoicePicker({
  cards,
  value,
  onChange,
  disabled,
  errorFor,
}: {
  /** From `useVariantQuote().cardsFor(services)`. */
  cards: VariantOption[];
  value: readonly VariantChoice[];
  onChange: (next: VariantChoice[]) => void;
  disabled?: boolean;
  /** The message for one card, e.g. from the quote's missing choice. */
  errorFor?: (optionId: string) => string | undefined;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => {
        const current = value.find((choice) => choice.optionId === card.axisKey)?.code ?? "";
        const options = [...card.values]
          .filter((option) => option.isActive || option.code === current)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((option) => ({
            value: option.code,
            label: option.isActive ? option.label : `${option.label} (nonaktif)`,
          }));

        return (
          <SelectField
            key={card._id}
            label={card.name}
            value={current}
            placeholder={`Pilih ${card.name.toLowerCase()}`}
            options={options}
            disabled={disabled}
            error={errorFor?.(card.axisKey)}
            onChange={(code) =>
              onChange([
                ...value.filter((choice) => choice.optionId !== card.axisKey),
                { optionId: card.axisKey, code },
              ])
            }
            required
          />
        );
      })}
    </div>
  );
}
