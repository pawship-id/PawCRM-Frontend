import { toMinor } from "@/utils/decimal";
import type { Pet, Service, ServiceVariantAxis } from "@/types/api";

/**
 * ANYTHING PRICED THE WAY A SERVICE IS — the catalogue's own row, one of its
 * add-ons, or the till's tile. The three carry the same four fields by design,
 * so one resolver serves all of them and there is no second rule to drift.
 */
type Priced = Pick<
  Service,
  "price" | "hasVariants" | "variantAxes" | "variants"
>;

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
  service: Partial<Priced> | null | undefined,
  pet: Pet | null | undefined,
): PriceLookup {
  if (!service) return { price: null, missingAxis: null };

  if (!service.hasVariants) {
    return { price: service.price ?? null, missingAxis: null };
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
 * The pet vocabulary, in Bahasa — what each stored axis value is called on
 * screen.
 *
 * ⚠️ IT LIVES HERE, BESIDE THE FUNCTION THAT READS IT, since the till's grid
 * became the second screen naming a variant. It was a `const` inside
 * `BookingPetGroupCard`, and a second copy is how "Bulu panjang" becomes
 * "Panjang" on one screen and not the other — the animal is described the same
 * way wherever it is described.
 *
 * KEYED BY THE STORED VALUE, and an unknown one falls through to itself rather
 * than to a blank: a species added to the model before this table is a word
 * somebody can still read.
 */
export const VARIANT_VALUE_LABELS: Record<string, Record<string, string>> = {
  petType: { cat: "Kucing", dog: "Anjing" },
  sizeCategory: { small: "Kecil", medium: "Sedang", large: "Besar" },
  furType: { "long hair": "Bulu panjang", "short hair": "Bulu pendek" },
};

/**
 * A label for the variant an animal falls into — "Anjing · Besar" — so a screen
 * can show WHICH price is being applied rather than just the number.
 *
 * NULL ON A FLAT-PRICED SERVICE, where there is no variant to name and a caption
 * would be noise under every ordinary line.
 */
export function variantLabelForPet(
  service: Partial<Priced> | null | undefined,
  pet: Pet | null | undefined,
  labels: Record<string, Record<string, string>> = VARIANT_VALUE_LABELS,
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

/**
 * What a service costs ACROSS its variants — "Rp 120.000–140.000".
 *
 * ─── A TILE HAS NO ANIMAL, AND THAT IS THE WHOLE PROBLEM ───────────────────
 *
 * The price of a variant-priced grooming is a fact about the dog, and the grid
 * is drawn before anybody has chosen one. So the tile showed an em-dash — which
 * is honest and useless: a cashier reading it cannot tell an unpriced service
 * from one that simply depends on the animal, and has no idea what to quote
 * over the counter.
 *
 * A RANGE ANSWERS BOTH. It says the figure varies, and it says between what and
 * what — which is what somebody asking "berapa grooming?" on the phone needs.
 * When every variant costs the same it collapses to one figure rather than
 * printing it twice.
 *
 * NULL WHEN NOTHING CAN BE SAID: a flat-priced service (its own `price` is the
 * answer), or one whose variants carry no prices at all. The caller decides what
 * to draw then — it is not this function's business.
 */
export function priceRange(
  service: Partial<Priced> | null | undefined,
  format: (value: string) => string,
): string | null {
  if (!service?.hasVariants) return null;

  const prices = (service.variants ?? [])
    .map((variant) => variant.price)
    .filter((price): price is string => Boolean(price));

  if (prices.length === 0) return null;

  /*
    SORTED IN MINOR UNITS, never as strings: "90000.0000" sorts after
    "120000.0000" lexically, so the range would read backwards on exactly the
    catalogue where the cheapest variant has fewer digits.
  */
  const sorted = [...prices].sort((a, b) =>
    Number((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n)),
  );

  const low = sorted[0];
  const high = sorted[sorted.length - 1];

  if (low === high) return format(low);

  /*
    THE CURRENCY ONCE. "Rp 120.000 – Rp 140.000" is twice the width for the same
    fact, on a tile that has one line for it.
  */
  return `${format(low)}–${format(high).replace(/^\D+/, "")}`;
}
