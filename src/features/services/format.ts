import { formatMoney, toMinor } from "@/utils/decimal";
import type { Service } from "@/types/api";

/**
 * How a service's price and length read in a list — shared by the service form's
 * neighbours: Grooming › Layanan & Harga and a service's detail page.
 *
 * PROMOTED OUT OF `ServicesTable`, where both lived as private helpers, the day
 * a second list wanted them (ui-rules §14). Two copies of "what does a
 * variant-priced service cost" would be two answers the day one of them learned
 * about a new axis.
 */

/**
 * The cheapest and dearest a service sells for, as the stored decimal strings —
 * `null` when it has no usable price at all.
 *
 * A flat service's bounds are its one price. A variant-priced one stores
 * `price: null` and carries its amounts on the variants, so the bounds are the
 * lowest and highest of those — the ACTIVE ones only (13 September 2026): a
 * variant switched off cannot be sold, and a range quoting it would promise a
 * price the counter refuses.
 *
 * Compared as integer minor units (`toMinor`), never as Numbers: the ordering
 * of two prices must not depend on what a double can hold.
 */
export function servicePriceBounds(
  service: Pick<Service, "hasVariants" | "price" | "variants">,
): { low: string; high: string } | null {
  if (!service.hasVariants) {
    return service.price !== null && toMinor(service.price) !== null
      ? { low: service.price, high: service.price }
      : null;
  }

  // `?? []` — a service stored before `variants` existed has no such key.
  const priced = (service.variants ?? []).filter(
    (variant) => variant.isActive !== false && toMinor(variant.price) !== null,
  );
  if (priced.length === 0) return null;

  const lowest = priced.reduce((low, variant) =>
    (toMinor(variant.price) as bigint) < (toMinor(low.price) as bigint)
      ? variant
      : low,
  );
  const highest = priced.reduce((high, variant) =>
    (toMinor(variant.price) as bigint) > (toMinor(high.price) as bigint)
      ? variant
      : high,
  );

  return { low: lowest.price, high: highest.price };
}

/**
 * What a service costs, as one cell.
 *
 * A RANGE RATHER THAN AN EM DASH for a variant-priced service: "—" in a price
 * column reads as "not priced yet", which is the one thing that row is not. The
 * lowest and highest of its variants is what a menu reader actually wants to
 * know, and it collapses to a single amount when every variant costs the same.
 */
export function formatServicePrice(
  service: Pick<Service, "hasVariants" | "price" | "variants">,
): string {
  if (!service.hasVariants) return formatMoney(service.price);

  const bounds = servicePriceBounds(service);
  if (!bounds) return "—";

  return toMinor(bounds.low) === toMinor(bounds.high)
    ? formatMoney(bounds.low)
    : `${formatMoney(bounds.low)} – ${formatMoney(bounds.high)}`;
}

/** Minutes as something a person reads — "1 jam 30 mnt", not "90". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} mnt`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}

/**
 * The shortest and longest a service takes, in minutes — its one duration when
 * flat, or across its ACTIVE variants when priced per variant, each of which
 * carries its own length since 13 September 2026. `null` when none is recorded.
 */
export function serviceDurationBounds(
  service: Pick<Service, "hasVariants" | "durationMin" | "variants">,
): { low: number; high: number } | null {
  if (!service.hasVariants) {
    return service.durationMin === null
      ? null
      : { low: service.durationMin, high: service.durationMin };
  }

  const minutes = (service.variants ?? [])
    .filter((variant) => variant.isActive !== false)
    .map((variant) => variant.durationMin)
    .filter((value): value is number => typeof value === "number");

  if (minutes.length === 0) return null;

  return { low: Math.min(...minutes), high: Math.max(...minutes) };
}

/**
 * "45–115 mnt" across variants, "45 mnt" when they agree, "—" with none.
 *
 * A RANGE STAYS IN MINUTES, the mockup's own reading: "45 mnt – 1 jam 55 mnt" is
 * twice the width of a column cell for the same two numbers.
 */
export function formatDurationRange(
  bounds: { low: number; high: number } | null,
): string {
  if (!bounds) return "—";
  if (bounds.low === bounds.high) return formatDuration(bounds.low);

  return `${bounds.low}–${bounds.high} mnt`;
}
