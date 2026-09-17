import { toMinor } from "@/utils/decimal";
import type {
  Pet,
  PetOptionType,
  Service,
  ServiceVariant,
  ServiceVariantAxis,
  VariantAxisKey,
  VariantChoice,
} from "@/types/api";

/**
 * ANYTHING PRICED THE WAY A SERVICE IS — the catalogue's own row, one of its
 * add-ons, or the till's tile. The three carry the same fields by design, so one
 * resolver serves all of them and there is no second rule to drift.
 *
 * `durationMin` is optional because a till tile predating it carries none.
 */
type Priced = Pick<
  Service,
  "price" | "hasVariants" | "variantAxes" | "variants"
> & { durationMin?: number | null };

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

/**
 * The axis on the service ← the pet-option list its values come from.
 *
 * THE SAME RENAME AS ABOVE, on the vocabulary side: a `petType` value is a
 * `species` option code (14 September 2026, when the lists became tenant data).
 */
export const AXIS_OPTION_TYPE: Record<ServiceVariantAxis, PetOptionType> = {
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

/*
  ─── AXES BEYOND THE PET (17 September 2026) ─────────────────────────────────

  A service may also vary by `"zone"` — answered by the zone the customer is in
  for the transaction's branch (utils/zoneDistance.ts) — and by "Dipilih staf"
  cards, keyed by card id and answered by the staff's choices. The server's
  utils/serviceVariant.js follows the same rule.
*/

/** Whether `axis` is one of the pet's three facts. */
export function isPetAxis(axis: VariantAxisKey): axis is ServiceVariantAxis {
  return axis === "petType" || axis === "sizeCategory" || axis === "furType";
}

/** Whether `axis` names a "Dipilih staf" card. */
export function isStaffAxis(axis: VariantAxisKey): boolean {
  return !isPetAxis(axis) && axis !== "zone";
}

/** Whether the service varies by Zona. */
export function variesByZone(service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined) {
  return Boolean(service?.hasVariants) && (service?.variantAxes ?? []).includes("zone");
}

/** The "Dipilih staf" card ids the service declares, in declared order. */
export function staffAxesOf(
  service: Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined,
): string[] {
  return service?.hasVariants ? (service.variantAxes ?? []).filter(isStaffAxis) : [];
}

/** What a quote needs beyond the pet. Both optional: a pet-only service asks neither. */
export interface PriceContext {
  /** The zone the customer is in for this branch, or null when unknown. */
  zoneId?: string | null;
  /** The staff's choices — a list, or `{ [optionId]: code }`. */
  choices?: readonly VariantChoice[] | Record<string, string> | null;
}

/** `choices` in either shape → `Map<optionId, code>`. */
export function choiceMap(choices: PriceContext["choices"]): Map<string, string> {
  if (!choices) return new Map();
  if (Array.isArray(choices)) {
    return new Map(
      (choices as readonly VariantChoice[])
        .filter((choice) => choice.optionId && choice.code)
        .map((choice) => [choice.optionId, choice.code]),
    );
  }
  return new Map(Object.entries(choices).filter(([, code]) => Boolean(code)));
}

/** The value a stored variant holds on `axis`. */
export function variantValueOn(
  variant: Partial<ServiceVariant>,
  axis: VariantAxisKey,
): string | null {
  if (isPetAxis(axis)) return (variant[axis] as string | null | undefined) ?? null;
  if (axis === "zone") return variant.zoneId ?? null;
  return variant.choices?.find((choice) => choice.optionId === axis)?.code ?? null;
}

export interface PriceLookup {
  /** The decimal string to display, or null when it cannot be determined. */
  price: string | null;
  /** Set when the ANIMAL is why: the axis whose fact is missing. */
  missingAxis: ServiceVariantAxis | null;
  /** The service varies by Zona and the customer's zone is not known. */
  missingZone: boolean;
  /** The id of the "Dipilih staf" card nobody has chosen a value on yet. */
  missingChoice: string | null;
  /**
   * How long it takes for this animal — the variant's own length, or a flat
   * service's one. Null when it cannot be said.
   */
  durationMin: number | null;
  /**
   * The animal's variant exists and is SWITCHED OFF (13 September 2026). Its
   * price still comes back, so a screen can show what it would have been — but
   * the line cannot be chosen, and the server refuses a new one.
   */
  inactive: boolean;
}

const NOTHING: PriceLookup = {
  price: null,
  missingAxis: null,
  missingZone: false,
  missingChoice: null,
  durationMin: null,
  inactive: false,
};

/** What `service` costs for `pet`, or why it cannot be said. */
export function priceForPet(
  service: Partial<Priced> | null | undefined,
  pet: Pet | null | undefined,
  context: PriceContext = {},
): PriceLookup {
  if (!service) return NOTHING;

  if (!service.hasVariants) {
    return {
      ...NOTHING,
      price: service.price ?? null,
      durationMin: service.durationMin ?? null,
    };
  }

  const axes = service.variantAxes ?? [];
  if (axes.length === 0 || !service.variants?.length) {
    return NOTHING;
  }

  const wanted: Record<string, string> = {};
  const chosen = choiceMap(context.choices);

  /* Declared order — the first question the form must ask is the one reported. */
  for (const axis of axes) {
    if (isPetAxis(axis)) {
      const value = pet?.[AXIS_TO_PET_FIELD[axis]] ?? null;
      if (value === null) return { ...NOTHING, missingAxis: axis };
      wanted[axis] = value as string;
    } else if (axis === "zone") {
      if (!context.zoneId) return { ...NOTHING, missingZone: true };
      wanted[axis] = context.zoneId;
    } else {
      const code = chosen.get(axis) ?? null;
      if (code === null) return { ...NOTHING, missingChoice: axis };
      wanted[axis] = code;
    }
  }

  /*
    MATCHED ON THE DECLARED AXES ONLY. A variant carries null in the fields its
    service does not vary by, so comparing all three would fail on the nulls
    rather than on a real difference — and every size-priced service would look
    unpriceable for every animal.
  */
  const match = service.variants.find((variant) =>
    axes.every((axis) => variantValueOn(variant, axis) === wanted[axis]),
  );

  if (!match) return NOTHING;

  return {
    ...NOTHING,
    price: match.price ?? null,
    // A variant stored before variants had lengths reads the service's old one.
    durationMin: match.durationMin ?? service.durationMin ?? null,
    // `false` only — a variant stored before the flag existed was being sold.
    inactive: match.isActive === false,
  };
}

/** Names a stored option code — `usePetOptions().label` is exactly this. */
export type VariantValueLabel = (
  type: PetOptionType,
  code: string,
) => string | null;

/**
 * A label for the variant an animal falls into — "Anjing · Besar" — so a screen
 * can show WHICH price is being applied rather than just the number.
 *
 * `label` IS REQUIRED, and is the tenant's word — pass `usePetOptions().label`.
 * It used to default to `VARIANT_VALUE_LABELS`, seven words typed in here
 * (removed 14 September 2026, when species, sizes and coats became tenant data),
 * which is how a shop that renamed "Besar" would have gone on reading "Besar" on
 * the one caption meant to let a cashier check the price. A code nothing can
 * name falls through to itself rather than to a blank.
 *
 * NULL ON A FLAT-PRICED SERVICE, where there is no variant to name and a caption
 * would be noise under every ordinary line.
 */
export function variantLabelForPet(
  service: Partial<Priced> | null | undefined,
  pet: Pet | null | undefined,
  label: VariantValueLabel,
): string | null {
  if (!service?.hasVariants) return null;

  const parts = (service.variantAxes ?? [])
    .filter(isPetAxis)
    .map((axis) => {
      const value = pet?.[AXIS_TO_PET_FIELD[axis]] ?? null;
      return value === null
        ? null
        : (label(AXIS_OPTION_TYPE[axis], value as string) ?? (value as string));
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
 * ONLY ACTIVE VARIANTS COUNT. A variant switched off cannot be sold, and quoting
 * its price over the phone would promise something the counter then refuses.
 *
 * NULL WHEN NOTHING CAN BE SAID: a flat-priced service (its own `price` is the
 * answer), or one with no active priced variant. The caller decides what to draw
 * then — it is not this function's business.
 */
export function priceRange(
  service: Partial<Priced> | null | undefined,
  format: (value: string) => string,
): string | null {
  if (!service?.hasVariants) return null;

  const prices = (service.variants ?? [])
    .filter((variant) => variant.isActive !== false)
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
