import { formatMoney, toMinor } from "@/utils/decimal";
import type { Service } from "@/types/api";

/**
 * How a service's price and length read in a list — shared by Master Data ›
 * Layanan and the Grooming module's Layanan & Harga tab.
 *
 * PROMOTED OUT OF `ServicesTable`, where both lived as private helpers, the day
 * a second list wanted them (ui-rules §14). Two copies of "what does a
 * variant-priced service cost" would be two answers the day one of them learned
 * about a new axis.
 */

/**
 * What a variant-priced service costs, as one cell.
 *
 * A RANGE RATHER THAN AN EM DASH. A service priced per pet stores `price: null`
 * and carries its amounts on the variants, so the plain field is genuinely
 * empty — but "—" in a price column reads as "not priced yet", which is the one
 * thing this row is not. The lowest and highest of its variants is what a menu
 * reader actually wants to know, and it collapses to a single amount when every
 * variant happens to cost the same.
 *
 * Compared as integer minor units (`toMinor`), never as Numbers: the ordering
 * of two prices must not depend on what a double can hold.
 */
export function formatServicePrice(
  service: Pick<Service, "hasVariants" | "price" | "variants">,
): string {
  if (!service.hasVariants) return formatMoney(service.price);

  // `?? []` — a service stored before `variants` existed has no such key.
  const priced = (service.variants ?? []).filter(
    (variant) => toMinor(variant.price) !== null,
  );
  if (priced.length === 0) return "—";

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

  return lowest.price === highest.price
    ? formatMoney(lowest.price)
    : `${formatMoney(lowest.price)} – ${formatMoney(highest.price)}`;
}

/** Minutes as something a person reads — "1 jam 30 mnt", not "90". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} mnt`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}
