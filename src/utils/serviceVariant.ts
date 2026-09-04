import type { Pet, Service, ServiceVariantAxis } from "@/types/api";

/**
 * What a service costs FOR ONE ANIMAL — the client's mirror of the server's
 * `utils/serviceVariant.js`.
 *
 * ─── TWO IMPLEMENTATIONS OF ONE RULE, KNOWINGLY ────────────────────────────
 *
 * The same trade this codebase already makes for "selesai sekitar": the form
 * has to show a price while somebody is still choosing, and the only other way
 * to get one is a round trip per tick of a checkbox. So the rule is mirrored,
 * and the mirror is a PREVIEW — the stored answer is the server's, which
 * re-resolves it from the same pet and refuses the save if it cannot.
 *
 * That is why this returns `null` rather than throwing or guessing: a preview
 * that cannot price something says so quietly, and the server is what turns
 * that into a refusal with a sentence attached.
 *
 * ─── IT NEVER GUESSES, EITHER ──────────────────────────────────────────────
 *
 * A pet with no size cannot be quoted for a service priced by size. Falling back
 * to the cheapest variant would put a number on screen that the save then
 * contradicts, which is worse than showing nothing.
 */

/**
 * The axis on the service ← the field it reads on the pet.
 *
 * `petType` IS `species` ON THE ANIMAL — the one rename between the two
 * collections, written here once. Reading `pet.petType` would find undefined on
 * every animal ever stored, and the bug would look like "variants do not work".
 */
const AXIS_TO_PET_FIELD: Record<ServiceVariantAxis, keyof Pet> = {
  petType: "species",
  sizeCategory: "size",
  furType: "furType",
};

/** How each axis is named to somebody being told what is missing. */
export const AXIS_LABEL: Record<ServiceVariantAxis, string> = {
  petType: "tipe hewan",
  sizeCategory: "ukuran",
  furType: "jenis bulu",
};

export interface PriceLookup {
  /** The decimal string to display, or null when it cannot be determined. */
  price: string | null;
  /** Set when the ANIMAL is why: the axis whose fact is missing. */
  missingAxis: ServiceVariantAxis | null;
}

/** What `service` costs for `pet`, or why it cannot be said. */
export function priceForPet(
  service: Service | null | undefined,
  pet: Pet | null | undefined,
): PriceLookup {
  if (!service) return { price: null, missingAxis: null };

  if (!service.hasVariants) {
    return { price: service.price, missingAxis: null };
  }

  const axes = service.variantAxes ?? [];
  if (axes.length === 0 || !service.variants?.length) {
    return { price: null, missingAxis: null };
  }

  const wanted: Partial<Record<ServiceVariantAxis, string>> = {};

  for (const axis of axes) {
    const value = pet?.[AXIS_TO_PET_FIELD[axis]] ?? null;
    if (value === null) return { price: null, missingAxis: axis };
    wanted[axis] = value as string;
  }

  /*
    MATCHED ON THE DECLARED AXES ONLY. A variant carries null in the fields its
    service does not vary by, so comparing all three would fail on the nulls
    rather than on a real difference — and every size-priced service would look
    unpriceable for every animal.
  */
  const match = service.variants.find((variant) =>
    axes.every((axis) => variant[axis] === wanted[axis]),
  );

  return { price: match?.price ?? null, missingAxis: null };
}

/**
 * A label for the variant an animal falls into — "Anjing · Besar" — so the card
 * can show WHICH price is being applied rather than just the number.
 */
export function variantLabelForPet(
  service: Service | null | undefined,
  pet: Pet | null | undefined,
  labels: Record<string, Record<string, string>>,
): string | null {
  if (!service?.hasVariants) return null;

  const parts = (service.variantAxes ?? [])
    .map((axis) => {
      const value = pet?.[AXIS_TO_PET_FIELD[axis]] ?? null;
      return value === null ? null : (labels[axis]?.[value as string] ?? value);
    })
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
}
