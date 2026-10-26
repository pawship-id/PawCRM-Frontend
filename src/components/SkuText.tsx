import { SKU_MAX_CHARS } from "@/lib/sku";

import { HighlightText } from "./HighlightText";
import { InfoTooltip } from "./InfoTooltip";

/**
 * An SKU in a list or picker. Up to `SKU_MAX_CHARS` it is shown whole; a
 * longer one is CUT with an ellipsis, and the cut text itself opens the full
 * code — hover on a mouse, tap on a touch screen, focus on a keyboard — the
 * same popover as the ⓘ (16 October 2026, on request: a wrapped SKU took two
 * or three lines in every table).
 */
export function SkuText({
  value,
  fallback = "",
  query,
}: {
  value: string | null | undefined;
  /** Shown when there is no SKU — a parent product, a service line. */
  fallback?: string;
  /** A search term to highlight in a whole SKU. A cut one stays plain. */
  query?: string;
}) {
  if (!value) return <>{fallback}</>;
  if (value.length <= SKU_MAX_CHARS) {
    return <HighlightText text={value} query={query} />;
  }

  return (
    <InfoTooltip hint={value} label={`${value.slice(0, SKU_MAX_CHARS)}…`} />
  );
}
