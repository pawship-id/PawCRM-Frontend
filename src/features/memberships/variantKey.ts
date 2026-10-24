import type { Service, ServiceVariant } from "@/types/api";
import type { VariantPrice } from "@/types/membership";
import { toMinor } from "@/utils/decimal";

/**
 * THE VARIANT KEY a membership price is written against — the client mirror of
 * the backend's `utils/membershipVariant.js` (contract §1.1).
 *
 *     "<speciesId>|<sizeId>|<furTypeId>"
 *
 * The service price grid's own three axes, in that order. AN EMPTY SEGMENT
 * MEANS "ANY" (`"<cat>||"` prices every cat); at least one segment is filled.
 * A row prices an animal when EVERY filled segment of the row equals the
 * animal's, and the MOST SPECIFIC matching row wins.
 *
 * Shared by the plan form (package price per variant, option special price per
 * variant), its preview estimate, and — later — the sell dialog.
 */

const SEPARATOR = "|";

export interface VariantParts {
  species: string;
  size: string;
  fur: string;
}

export function parseVariantKey(key: string | null | undefined): VariantParts {
  const [species = "", size = "", fur = ""] = (key ?? "").split(SEPARATOR);
  return { species, size, fur };
}

/** `""` when every segment is empty — that is not a key (the API refuses it). */
export function buildVariantKey(parts: Partial<VariantParts>): string {
  const segments = [parts.species ?? "", parts.size ?? "", parts.fur ?? ""];
  return segments.some(Boolean) ? segments.join(SEPARATOR) : "";
}

/** The key of one service price-grid row (`petType|sizeCategory|furType`). */
export function serviceVariantKey(
  variant: Pick<ServiceVariant, "petType" | "sizeCategory" | "furType">,
): string {
  return buildVariantKey({
    species: variant.petType ?? "",
    size: variant.sizeCategory ?? "",
    fur: variant.furType ?? "",
  });
}

const filled = (parts: VariantParts) =>
  [parts.species, parts.size, parts.fur].filter(Boolean).length;

/** Does `rowKey` (with its "any" segments) cover the animal `petKey`? */
export function variantKeyCovers(rowKey: string, petKey: string): boolean {
  const row = parseVariantKey(rowKey);
  const pet = parseVariantKey(petKey);
  return (
    (!row.species || row.species === pet.species) &&
    (!row.size || row.size === pet.size) &&
    (!row.fur || row.fur === pet.fur)
  );
}

/**
 * The price `rows` give the animal `petKey` — most specific match wins, null
 * when nothing matches. The same rule the server applies at issue and in the
 * benefit engine.
 */
export function matchVariantPrice(
  rows: VariantPrice[],
  petKey: string | null | undefined,
): string | null {
  if (!petKey) return null;
  let best: VariantPrice | null = null;
  let bestScore = -1;

  for (const row of rows) {
    if (!row.variantKey || !variantKeyCovers(row.variantKey, petKey)) continue;
    const score = filled(parseVariantKey(row.variantKey));
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  return best?.price ?? null;
}

/**
 * "Kucing · Kecil · Bulu panjang" — a key in the tenant's words. Empty
 * segments are simply left out ("Kucing" prices every cat).
 */
export function variantKeyLabel(
  key: string,
  label: (type: "species" | "size" | "furType", id: string) => string | null,
): string {
  const parts = parseVariantKey(key);
  const words = [
    parts.species ? label("species", parts.species) : null,
    parts.size ? label("size", parts.size) : null,
    parts.fur ? label("furType", parts.fur) : null,
  ].filter((word): word is string => Boolean(word));

  return words.length ? words.join(" · ") : "Semua hewan";
}

/**
 * The distinct keys of a service's ACTIVE grid rows, each with its price —
 * the rows "Isi otomatis dari layanan" offers. A key repeated across zones
 * keeps its LOWEST price (zone is not a membership axis).
 */
export function serviceVariantPrices(
  service: Pick<Service, "hasVariants" | "variants"> | null | undefined,
): VariantPrice[] {
  if (!service?.hasVariants) return [];
  const byKey = new Map<string, string>();

  for (const variant of service.variants ?? []) {
    if (variant.isActive === false || !variant.price) continue;
    const key = serviceVariantKey(variant);
    if (!key) continue;
    const current = byKey.get(key);
    if (current === undefined || (toMinor(variant.price) ?? 0n) < (toMinor(current) ?? 0n)) {
      byKey.set(key, variant.price);
    }
  }

  return [...byKey].map(([variantKey, price]) => ({ variantKey, price }));
}

/**
 * What a service normally costs the animal `petKey`.
 *
 * A flat service answers its own `price`. A variant service answers the most
 * specific grid row covering the animal — and when `petKey` is itself partial
 * ("every cat", from a plan row) and no row covers it, the DEAREST row it could
 * mean, because the estimate it feeds says "hingga" (up to).
 */
export function servicePriceFor(
  service: Pick<Service, "hasVariants" | "variants" | "price"> | null | undefined,
  petKey: string | null | undefined,
): string | null {
  if (!service) return null;
  if (!service.hasVariants) return service.price ?? null;

  const rows = serviceVariantPrices(service);
  if (!petKey) return maxPrice(rows.map((row) => row.price));

  const exact = matchVariantPrice(rows, petKey);
  if (exact !== null) return exact;

  return maxPrice(
    rows
      .filter((row) => variantKeyCovers(petKey, row.variantKey))
      .map((row) => row.price),
  );
}

function maxPrice(prices: string[]): string | null {
  let best: string | null = null;
  for (const price of prices) {
    if (best === null || (toMinor(price) ?? 0n) > (toMinor(best) ?? 0n)) best = price;
  }
  return best;
}
