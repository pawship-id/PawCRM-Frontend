import type { CustomerInvoiceItem, VariantChoice } from "@/types/api";
import type { ApiError } from "@/services/api-error";

/**
 * WHAT A STORED LINE WAS PRICED ON BEYOND THE PET (17 September 2026) —
 * "Lokasi: Di Rumah · Zona A", or null when the line carries neither.
 *
 * Read off the line's own snapshot, never off today's catalogue: a card renamed
 * since, or a zone redrawn, does not change what the bill was priced on.
 */
export function variantSummary(
  item: Pick<CustomerInvoiceItem, "variantChoices" | "zone">,
): string | null {
  const parts = [
    ...(item.variantChoices ?? []).map((choice) => `${choice.name}: ${choice.label}`),
    ...(item.zone ? [item.zone.name] : []),
  ];

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A refusal pinned to one line — and to one card on it, when it names one. */
export interface LineRefusal {
  message: string;
  optionId?: string;
}

/**
 * The server's first refusal detail, when it is about a line's price beyond the
 * pet: `items[N].*` (a zone the customer's pin cannot answer, among others) or
 * `variantChoices` naming the card nobody chose.
 *
 * `optionId` and `zoneReason` ride on the detail beside `field` and `message`;
 * the shared `ValidationDetail` type does not declare them, so they are read
 * here defensively.
 */
export function lineRefusalOf(
  error: ApiError,
): { index: number | null; refusal: LineRefusal } | null {
  const detail = Array.isArray(error.details)
    ? (error.details[0] as
        | { field?: unknown; message?: unknown; optionId?: unknown }
        | undefined)
    : undefined;

  if (!detail || typeof detail.field !== "string" || typeof detail.message !== "string") {
    return null;
  }

  const field = detail.field.replace(/^body\./, "");
  const at = /^items\[(\d+)\]/.exec(field);

  if (at) {
    return { index: Number(at[1]), refusal: { message: detail.message } };
  }

  if (field === "variantChoices") {
    return {
      index: null,
      refusal: {
        message: detail.message,
        ...(typeof detail.optionId === "string" ? { optionId: detail.optionId } : {}),
      },
    };
  }

  return null;
}

/** The chosen value on `optionId`, if any. */
export const hasChoice = (choices: readonly VariantChoice[], optionId: string) =>
  choices.some((choice) => choice.optionId === optionId && choice.code !== "");
