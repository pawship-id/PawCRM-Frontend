import type {
  ServiceKind,
  PetFurType,
  PetOption,
  PetOptionType,
  PetSize,
  PetSpecies,
  ServiceVariant,
  ServiceVariantAxis,
  VariantAxisKey,
  VariantChoice,
  VariantOption,
  Zone,
} from "@/types/api";
import { AXIS_OPTION_TYPE, isPetAxis, variantValueOn } from "@/utils/serviceVariant";

/**
 * The values a service's price can vary by, and the combinations they make.
 *
 * ─── THE VALUES ARE THE TENANT'S, NOT THIS FILE'S (14 September 2026) ──────
 *
 * Until today each axis's values were a closed list typed in beside the form —
 * two species, three sizes, two coats — mirroring the enums on pet.model.js.
 * They are tenant data now, one `petoptions` collection: a shop that adds
 * "Ekstra besar" can price it the same afternoon, and one that renames "Kecil"
 * sees its own word on every row. So NOTHING HERE READS A VALUE FROM A MODULE
 * CONSTANT. The screen builds a `VariantAxisValues` from `usePetOptions()` (see
 * `useVariantAxisValues`) and hands it to every function below, which keeps them
 * pure — a test passes a table, not a mocked store.
 *
 * THE AXES ARE THE TENANT'S TOO since 17 September 2026 (Opsi Varian): the
 * pet's three, `"zone"`, and any "Dipilih staf" card. What stays fixed is the
 * ORDER they are keyed in — the pet's three in `VARIANT_AXES` order, then Zona,
 * then staff cards as the service lists them — because that order is part of
 * every combination's key, and a key is what a typed price is held under.
 *
 * ─── A PRICED VALUE NEVER DISAPPEARS ───────────────────────────────────────
 *
 * The table is the tenant's ACTIVE options in their order, PLUS every value the
 * service already prices, whatever became of its option. A size retired last
 * week still has a price on this service, and a grid that dropped the row would
 * drop the price on the next save without anybody deciding to. The server agrees:
 * it refuses a retired option on a variant unless the stored service already
 * prices it. Such a value is marked `retired` and its label says "(nonaktif)",
 * the same word every pet picker uses for it.
 */

/** The pet's three axes — keyed first, in this order. */
export const VARIANT_AXES: readonly ServiceVariantAxis[] = [
  "petType",
  "sizeCategory",
  "furType",
];

/**
 * Most variants one service may carry — MAX_VARIANTS in service.model.js, 100
 * since axes became tenant-defined (Ukuran 4 × Lokasi 2 × Zona 3 is already 24).
 * The screens that tick axes check it before the round trip.
 */
export const MAX_VARIANTS = 100;

/** Most axes one service may vary by — MAX_VARIANT_AXES in service.model.js. */
export const MAX_VARIANT_AXES = 10;

/** One value an axis offers — the shape `usePetOptions().choices` returns. */
export interface VariantAxisValue {
  /** What a variant stores — an option code, a zone id, or a staff value code. */
  value: string;
  /** The tenant's word, " (nonaktif)" appended when `retired`. */
  label: string;
  /** Retired, deleted or unknown: here only because the service prices it. */
  retired: boolean;
}

/**
 * Each axis's values, in the order they are drawn, keyed by axis key. The pet's
 * three are always present; `"zone"` and staff card ids when the tenant has them
 * (or the service already prices them).
 */
export type VariantAxisValues = Record<string, VariantAxisValue[]>;

/** The fields of a stored variant the table needs. */
export type StoredVariantValues = Partial<
  Pick<ServiceVariant, ServiceVariantAxis | "zoneId" | "choices">
>;

/** An axis a service form can tick — one Opsi Varian card. */
export interface VariantAxisDef {
  key: VariantAxisKey;
  name: string;
  /** "Otomatis" unless `staff`. */
  source: VariantOption["source"];
  description: string | null;
  /** The kinds of service the card is for — empty is every kind. */
  serviceKinds: ServiceKind[];
}

const RETIRED_SUFFIX = " (nonaktif)";
const DELETED_ZONE_SUFFIX = " (dihapus)";

/** The pet cards' names when the card list has not arrived. */
const PET_AXIS_FALLBACK_NAME: Record<ServiceVariantAxis, string> = {
  petType: "Jenis Hewan",
  sizeCategory: "Ukuran",
  furType: "Jenis Bulu",
};

/**
 * The axes a service form offers, in card order. Before the cards load (or when
 * they cannot), the pet's three by their seeded names — what every form offered
 * before cards existed.
 */
export function variantAxisDefs(cards: readonly VariantOption[] | null | undefined): VariantAxisDef[] {
  const live = (cards ?? []).filter((card) => card.deletedAt === null);

  if (live.length === 0) {
    return VARIANT_AXES.map((key) => ({
      key,
      name: PET_AXIS_FALLBACK_NAME[key],
      source: AXIS_OPTION_TYPE[key] as VariantOption["source"],
      description: null,
      serviceKinds: [],
    }));
  }

  return [...live]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((card) => ({
      key: card.axisKey,
      name: card.name,
      source: card.source,
      description: card.description,
      serviceKinds: card.serviceKinds ?? [],
    }));
}

/**
 * THE AXES A SERVICE OF THIS KIND IS OFFERED (22 September 2026) — a card for
 * every kind, or one naming this kind: Ukuran for grooming, Zona and Arah for
 * pickup-delivery. The kind is the module the form was opened from. An axis the
 * service already `keep`s is offered whatever its card says now, so narrowing a
 * card never hides a price a service is already priced on. No kind → every card.
 */
export function axisDefsForKind(
  defs: readonly VariantAxisDef[],
  kind: ServiceKind | null | undefined,
  keep: readonly string[] = [],
): VariantAxisDef[] {
  if (!kind) return [...defs];

  return defs.filter(
    (def) =>
      def.serviceKinds.length === 0 ||
      def.serviceKinds.includes(kind) ||
      keep.includes(def.key),
  );
}

/** The hook's own ordering — `sortOrder`, then the word. */
function byOrder(a: PetOption, b: PetOption) {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "id");
}

/**
 * The table for one service: `options` (the tenant's pet options, any type)
 * narrowed per pet axis to the active ones, `extra.zones` for Zona and
 * `extra.cards` for "Dipilih staf" cards — each plus whatever `variants` already
 * price.
 *
 * A KEPT VALUE WHOSE OPTION STILL EXISTS KEEPS ITS PLACE in `sortOrder` — a
 * retired "Sedang" stays between Kecil and Besar, which is what "Isi bertingkat
 * per ukuran" steps through. A code with no live option at all (deleted, or
 * never one) goes last, named by `labelOf` when given — pass the hook's
 * `label`, which also knows deleted options and the seeded words.
 */
export function variantAxisValues(
  options: readonly PetOption[],
  variants?: readonly StoredVariantValues[] | null,
  labelOf?: (type: PetOptionType, code: string) => string | null,
  extra: { cards?: readonly VariantOption[]; zones?: readonly Zone[] } = {},
): VariantAxisValues {
  const table: VariantAxisValues = {};

  for (const axis of VARIANT_AXES) {
    const type = AXIS_OPTION_TYPE[axis];
    const priced = new Set(
      (variants ?? [])
        .map((variant) => variant[axis])
        .filter((code): code is string => Boolean(code)),
    );

    const values: VariantAxisValue[] = options
      .filter(
        (option) =>
          option.type === type &&
          option.deletedAt === null &&
          (option.isActive || priced.has(option.code)),
      )
      .sort(byOrder)
      .map((option) => ({
        value: option.code,
        label: option.isActive ? option.label : `${option.label}${RETIRED_SUFFIX}`,
        retired: !option.isActive,
      }));

    const listed = new Set(values.map((entry) => entry.value));
    for (const code of priced) {
      if (listed.has(code)) continue;

      const word =
        labelOf?.(type, code) ??
        options.find((option) => option.type === type && option.code === code)
          ?.label ??
        code;
      values.push({ value: code, label: `${word}${RETIRED_SUFFIX}`, retired: true });
    }

    table[axis] = values;
  }

  /* Zona — live zones nearest first, then a zone only a stored variant still prices. */
  const zones = extra.zones ?? [];
  const pricedZones = new Set(
    (variants ?? []).map((variant) => variant.zoneId).filter((id): id is string => Boolean(id)),
  );
  if (zones.length > 0 || pricedZones.size > 0) {
    const values: VariantAxisValue[] = zones
      .filter((zone) => zone.deletedAt === null)
      .sort((a, b) => a.minKm - b.minKm)
      .map((zone) => ({ value: zone._id, label: zone.name, retired: false }));
    const listed = new Set(values.map((entry) => entry.value));
    for (const id of pricedZones) {
      if (listed.has(id)) continue;
      const word = zones.find((zone) => zone._id === id)?.name ?? "Zona";
      values.push({ value: id, label: `${word}${DELETED_ZONE_SUFFIX}`, retired: true });
    }
    table.zone = values;
  }

  /* Dipilih staf — each card's active values in order, then retired ones still priced. */
  for (const card of extra.cards ?? []) {
    if (card.source !== "staff") continue;

    const priced = new Set(
      (variants ?? [])
        .flatMap((variant) => variant.choices ?? [])
        .filter((choice) => choice.optionId === card._id)
        .map((choice) => choice.code),
    );

    const values: VariantAxisValue[] = [...card.values]
      .filter((value) => value.isActive || priced.has(value.code))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((value) => ({
        value: value.code,
        label: value.isActive ? value.label : `${value.label}${RETIRED_SUFFIX}`,
        retired: !value.isActive,
      }));
    const listed = new Set(values.map((entry) => entry.value));
    for (const code of priced) {
      if (!listed.has(code)) values.push({ value: code, label: `${code}${RETIRED_SUFFIX}`, retired: true });
    }
    table[card.axisKey] = values;
  }

  return table;
}

/** One generated combination: the axis values, and the key its price is held under. */
export interface VariantCombo {
  key: string;
  petType: PetSpecies | null;
  sizeCategory: PetSize | null;
  furType: PetFurType | null;
  /** Set when the service varies by Zona. */
  zoneId: string | null;
  /** One per "Dipilih staf" axis, in key order. */
  choices: VariantChoice[];
  label: string;
  /** At least one of its values is kept only because the service prices it. */
  retired: boolean;
}

/**
 * The ticked axes, deduplicated, in KEY order: the pet's three as
 * `VARIANT_AXES`, then Zona, then staff cards as `axes` lists them.
 */
export function orderedAxes(axes: readonly VariantAxisKey[] | undefined): VariantAxisKey[] {
  const list = [...new Set(axes ?? [])];

  return [
    ...VARIANT_AXES.filter((axis) => list.includes(axis)),
    ...(list.includes("zone") ? (["zone"] as VariantAxisKey[]) : []),
    ...list.filter((axis) => !isPetAxis(axis) && axis !== "zone"),
  ];
}

/**
 * `["petType", "sizeCategory"]` → every combination of the two, in key order,
 * with the values `table` gives each axis.
 *
 * GENERATED RATHER THAN TYPED IN, which is what makes three of the server's
 * rules unreachable from a screen: no duplicate combination, no variant missing
 * a declared axis, and no variant setting one the service never declared. A
 * hand-built list could break all three, and the user would only find out on
 * save. The fourth rule — at most `MAX_VARIANTS` — is arithmetic on the table
 * and is checked with `variantComboCount`.
 */
export function buildVariantCombos(
  axes: readonly VariantAxisKey[] | undefined,
  table: VariantAxisValues,
): VariantCombo[] {
  // `undefined` is a real input, not a caller bug: a service stored before
  // `variantAxes` existed has no such key. No axes means no rows.
  const ordered = orderedAxes(axes);
  if (ordered.length === 0) return [];

  let rows: VariantCombo[] = [
    {
      key: "",
      petType: null,
      sizeCategory: null,
      furType: null,
      zoneId: null,
      choices: [],
      label: "",
      retired: false,
    },
  ];

  for (const axis of ordered) {
    rows = rows.flatMap((row) =>
      (table[axis] ?? []).map((entry) => ({
        ...row,
        ...(isPetAxis(axis)
          ? { [axis]: entry.value }
          : axis === "zone"
            ? { zoneId: entry.value }
            : { choices: [...row.choices, { optionId: axis, code: entry.value }] }),
        key: `${row.key}${entry.value}|`,
        label: row.label ? `${row.label} · ${entry.label}` : entry.label,
        retired: row.retired || entry.retired,
      })),
    );
  }

  return rows;
}

/** How many rows `buildVariantCombos` would make, without making them. */
export function variantComboCount(
  axes: readonly VariantAxisKey[] | undefined,
  table: VariantAxisValues,
): number {
  const ordered = orderedAxes(axes);
  if (ordered.length === 0) return 0;

  return ordered.reduce((count, axis) => count * (table[axis] ?? []).length, 1);
}

/** The key a stored variant is held under — must match `buildVariantCombos`. */
export function comboKey(
  axes: readonly VariantAxisKey[] | undefined,
  variant: StoredVariantValues | VariantCombo,
): string {
  return orderedAxes(axes)
    .map((axis) => `${variantValueOn(variant as Partial<ServiceVariant>, axis) ?? ""}|`)
    .join("");
}
