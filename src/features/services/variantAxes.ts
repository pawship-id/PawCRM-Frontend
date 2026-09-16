import type {
  PetFurType,
  PetOption,
  PetOptionType,
  PetSize,
  PetSpecies,
  ServiceVariant,
  ServiceVariantAxis,
} from "@/types/api";
import { AXIS_OPTION_TYPE } from "@/utils/serviceVariant";

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
 * WHAT STAYS FIXED IS THE AXES — three, in `VARIANT_AXES` order — because that
 * order is part of every combination's key, and a key is what a typed price is
 * held under. That is why `comboKey` takes no table: it never needed a value.
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

/** Combinations are generated, and keyed, in this order. */
export const VARIANT_AXES: readonly ServiceVariantAxis[] = [
  "petType",
  "sizeCategory",
  "furType",
];

/**
 * Most variants one service may carry — MAX_VARIANTS in service.model.js.
 *
 * UNREACHABLE WHILE THE LISTS WERE CLOSED (2 × 3 × 2 is twelve). A tenant with
 * four species, five sizes and three coats makes sixty, so the screens that tick
 * axes check it before the round trip.
 */
export const MAX_VARIANTS = 20;

/** One value an axis offers — the shape `usePetOptions().choices` returns. */
export interface VariantAxisValue {
  /** The option code — what a variant stores. */
  value: string;
  /** The tenant's word, " (nonaktif)" appended when `retired`. */
  label: string;
  /** Retired, deleted or unknown: here only because the service prices it. */
  retired: boolean;
}

/**
 * Each axis's values, in the order they are drawn — `sortOrder` first, so sizes
 * go smallest to largest, then any value kept only because the service prices it.
 */
export type VariantAxisValues = Record<ServiceVariantAxis, VariantAxisValue[]>;

/** The axis fields of a stored variant — all the table needs from one. */
export type StoredVariantValues = Partial<
  Pick<ServiceVariant, ServiceVariantAxis>
>;

const RETIRED_SUFFIX = " (nonaktif)";

/** The hook's own ordering — `sortOrder`, then the word. */
function byOrder(a: PetOption, b: PetOption) {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "id");
}

/**
 * The table for one service: `options` (the tenant's pet options, any type)
 * narrowed per axis to the active ones, plus whatever `variants` already price.
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
): VariantAxisValues {
  const table = {} as VariantAxisValues;

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

  return table;
}

/** One generated combination: the axis values, and the key its price is held under. */
export interface VariantCombo {
  key: string;
  petType: PetSpecies | null;
  sizeCategory: PetSize | null;
  furType: PetFurType | null;
  label: string;
  /** At least one of its values is kept only because the service prices it. */
  retired: boolean;
}

/** The ticked axes, deduplicated, in `VARIANT_AXES` order. */
function orderedAxes(axes: readonly ServiceVariantAxis[] | undefined) {
  return VARIANT_AXES.filter((axis) => (axes ?? []).includes(axis));
}

/**
 * `["petType", "sizeCategory"]` → every combination of the two, in axis order,
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
  axes: readonly ServiceVariantAxis[] | undefined,
  table: VariantAxisValues,
): VariantCombo[] {
  // `undefined` is a real input, not a caller bug: a service stored before
  // `variantAxes` existed has no such key, and this used to throw on
  // `axes.includes(...)` and blank the edit page. No axes means no rows.
  const ordered = orderedAxes(axes);
  if (ordered.length === 0) return [];

  let rows: VariantCombo[] = [
    {
      key: "",
      petType: null,
      sizeCategory: null,
      furType: null,
      label: "",
      retired: false,
    },
  ];

  for (const axis of ordered) {
    rows = rows.flatMap((row) =>
      (table[axis] ?? []).map((entry) => ({
        ...row,
        [axis]: entry.value,
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
  axes: readonly ServiceVariantAxis[] | undefined,
  table: VariantAxisValues,
): number {
  const ordered = orderedAxes(axes);
  if (ordered.length === 0) return 0;

  return ordered.reduce((count, axis) => count * (table[axis] ?? []).length, 1);
}

/** The key a stored variant is held under — must match `buildVariantCombos`. */
export function comboKey(
  axes: readonly ServiceVariantAxis[] | undefined,
  variant: {
    petType?: string | null;
    sizeCategory?: string | null;
    furType?: string | null;
  },
): string {
  return orderedAxes(axes)
    .map((axis) => `${variant[axis] ?? ""}|`)
    .join("");
}
