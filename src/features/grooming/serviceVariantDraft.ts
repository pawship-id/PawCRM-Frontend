import {
  buildVariantCombos,
  comboKey,
  VARIANT_AXIS_TABLE,
} from "@/features/services";
import type {
  Service,
  ServiceLocation,
  ServiceVariantAxis,
  UpdateServiceInput,
} from "@/types/api";

import { placeOf, type ServicePlace } from "./serviceDisplay";

/**
 * The Varian & Harga tab's DRAFT — what is being changed in place on a service's
 * detail page before somebody presses Simpan (decided 14 September 2026).
 *
 * PURE FUNCTIONS, so the grid's rules — which rows a new axis creates and what
 * they start from, what "+10%" does to a price, when the draft may be saved —
 * are tested without rendering a table.
 *
 * TEXT, NOT NUMBERS, while it is a draft. A price box half typed is not a price,
 * and a draft that parsed on every keystroke would turn "1" into 1 rupiah the
 * moment the second digit was late.
 */

/** Longest a service may take — `MAX_DURATION_MIN` in service.model.js. */
export const MAX_DURATION_MIN = 1440;

/** The order the chips are drawn in — the mockup's: Ukuran, Jenis bulu, Jenis hewan. */
export const AXIS_ORDER: ServiceVariantAxis[] = [
  "sizeCategory",
  "furType",
  "petType",
];

/** How many values each axis has — the chip's "×3". */
export const AXIS_VALUE_COUNT: Record<ServiceVariantAxis, number> = Object.fromEntries(
  VARIANT_AXIS_TABLE.map((entry) => [entry.axis, entry.values.length]),
) as Record<ServiceVariantAxis, number>;

/** Smallest to largest — what "Isi bertingkat per ukuran" steps through. */
const SIZE_ORDER = ["small", "medium", "large"];

export const PLACE_LOCATIONS: Record<ServicePlace, ServiceLocation[]> = {
  store: ["in_store"],
  home: ["in_home"],
  both: ["in_store", "in_home"],
};

export interface DraftRow {
  /** As typed or as formatted — "139.000". */
  price: string;
  /** Minutes as typed. */
  duration: string;
  active: boolean;
}

export interface VariantDraft {
  place: ServicePlace;
  /** Empty = one price and one duration for every animal. */
  axes: ServiceVariantAxis[];
  /** Keyed by `comboKey` — only the current axes' combinations matter. */
  rows: Record<string, DraftRow>;
  /** The one price and duration while `axes` is empty. */
  flat: DraftRow;
}

const BLANK: DraftRow = { price: "", duration: "", active: true };

/** "139000" → "139.000" — the dot is the Indonesian thousands separator. */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** A stored price — "139000.0000" — as the box shows it: "139.000". */
export function priceText(stored: string | null | undefined): string {
  if (!stored) return "";
  return groupDigits(stored.split(".")[0].replace(/^0+(?=\d)/, ""));
}

/**
 * What was typed → whole-rupiah digits the API takes, or null when it is not a
 * price.
 *
 * DOTS ARE THOUSANDS, as they are to anybody here: "139.000" is a hundred and
 * thirty-nine thousand. Only a dot in a thousands position is accepted, and a
 * comma never is — "139,5" is a question this box does not answer. The service
 * form refuses dots outright; this grid shows prices grouped, so it reads them
 * the way it writes them.
 */
export function priceDigits(text: string): string | null {
  const compact = text.trim();
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(compact)) return null;

  return compact.replace(/\./g, "").replace(/^0+(?=\d)/, "");
}

/** Minutes as typed → a whole number from 1 to a day, or null. */
export function durationValue(text: string): number | null {
  const compact = text.trim();
  if (!/^\d+$/.test(compact)) return null;

  const minutes = Number(compact);
  return minutes >= 1 && minutes <= MAX_DURATION_MIN ? minutes : null;
}

/** The row a combination has in the draft — blank until something is typed. */
export function rowOf(draft: VariantDraft, key: string): DraftRow {
  return draft.rows[key] ?? BLANK;
}

/** The draft a stored service starts as. */
export function seedDraft(service: Service): VariantDraft {
  const axes = service.hasVariants ? (service.variantAxes ?? []) : [];

  return {
    place: placeOf(service.serviceLocations),
    axes,
    rows: Object.fromEntries(
      (service.hasVariants ? (service.variants ?? []) : []).map((variant) => [
        comboKey(axes, variant),
        {
          price: priceText(variant.price),
          duration:
            variant.durationMin === null || variant.durationMin === undefined
              ? ""
              : String(variant.durationMin),
          active: variant.isActive !== false,
        },
      ]),
    ),
    flat: {
      price: service.hasVariants ? "" : priceText(service.price),
      duration:
        service.hasVariants || service.durationMin === null
          ? ""
          : String(service.durationMin),
      active: true,
    },
  };
}

/**
 * An axis ticked or unticked.
 *
 * NEW ROWS START FROM WHERE THEY CAME FROM, rather than blank. Ticking Jenis bulu
 * on a service priced by size splits "Kecil" into "Kecil · Bulu panjang" and
 * "Kecil · Bulu pendek", and both start at Kecil's price and minutes — somebody
 * refining an answer adjusts a few, instead of retyping every row. Unticking
 * merges rows back, keeping the first. Leaving variants altogether hands the
 * first row's figures to the single price, when it has none of its own.
 */
export function toggleAxis(
  draft: VariantDraft,
  axis: ServiceVariantAxis,
  on: boolean,
): VariantDraft {
  const nextAxes = VARIANT_AXIS_TABLE.map((entry) => entry.axis).filter(
    (candidate) => (candidate === axis ? on : draft.axes.includes(candidate)),
  );

  const oldCombos = buildVariantCombos(draft.axes);
  const shared = draft.axes.filter((candidate) => nextAxes.includes(candidate));

  const rows: Record<string, DraftRow> = {};
  for (const combo of buildVariantCombos(nextAxes)) {
    const parent = oldCombos.find((old) =>
      shared.every((candidate) => old[candidate] === combo[candidate]),
    );
    const source = parent
      ? draft.rows[parent.key]
      : draft.axes.length === 0
        ? draft.flat
        : undefined;

    rows[combo.key] = { ...(source ?? BLANK) };
  }

  let flat = draft.flat;
  if (nextAxes.length === 0 && draft.axes.length > 0) {
    const first = oldCombos.map((combo) => draft.rows[combo.key]).find(Boolean);
    if (first && !flat.price.trim() && !flat.duration.trim()) {
      flat = { ...first, active: true };
    }
  }

  return { ...draft, axes: nextAxes, rows, flat };
}

/** A change to one row of the grid. */
export function updateRow(
  draft: VariantDraft,
  key: string,
  patch: Partial<DraftRow>,
): VariantDraft {
  return {
    ...draft,
    rows: { ...draft.rows, [key]: { ...rowOf(draft, key), ...patch } },
  };
}

export type BulkAction =
  | { kind: "price"; digits: string }
  | { kind: "duration"; minutes: number }
  | { kind: "percent"; percent: number }
  | { kind: "rupiah"; delta: number }
  | { kind: "toggle" };

/**
 * One change to every selected row — the mockup's bulk bar.
 *
 * `Number` IS SAFE HERE: whole rupiah, and nowhere near a double's exact range.
 * "+%" rounds to the nearest thousand, as a shop prices; neither it nor "+Rp"
 * goes below zero. A row whose price is not a price yet is left alone rather
 * than treated as zero. Aktif/nonaktif turns everything off when anything
 * selected is on — the same answer the mockup gives.
 */
export function applyBulk(
  draft: VariantDraft,
  keys: string[],
  action: BulkAction,
): VariantDraft {
  const anyOn = keys.some((key) => rowOf(draft, key).active);
  let next = draft;

  for (const key of keys) {
    const row = rowOf(draft, key);
    const current = priceDigits(row.price);

    switch (action.kind) {
      case "price":
        next = updateRow(next, key, { price: groupDigits(action.digits) });
        break;
      case "duration":
        next = updateRow(next, key, { duration: String(action.minutes) });
        break;
      case "percent":
        if (current !== null) {
          const raised =
            Math.round((Number(current) * (1 + action.percent / 100)) / 1000) *
            1000;
          next = updateRow(next, key, {
            price: groupDigits(String(Math.max(0, raised))),
          });
        }
        break;
      case "rupiah":
        if (current !== null) {
          next = updateRow(next, key, {
            price: groupDigits(String(Math.max(0, Number(current) + action.delta))),
          });
        }
        break;
      case "toggle":
        next = updateRow(next, key, { active: !anyOn });
        break;
    }
  }

  return next;
}

/**
 * "Isi bertingkat per ukuran": Kecil at `base`, each size up `step` more — on
 * every row, whatever else the row varies by. Only meaningful while Ukuran is
 * one of the axes; a draft without it comes back unchanged.
 */
export function fillBySize(
  draft: VariantDraft,
  base: number,
  step: number,
): VariantDraft {
  if (!draft.axes.includes("sizeCategory")) return draft;

  let next = draft;
  for (const combo of buildVariantCombos(draft.axes)) {
    const index = SIZE_ORDER.indexOf(combo.sizeCategory ?? "");
    if (index < 0) continue;
    next = updateRow(next, combo.key, {
      price: groupDigits(String(Math.max(0, base + step * index))),
    });
  }

  return next;
}

/**
 * Why the draft cannot be saved yet, said as the rest of a sentence, or null.
 * The server holds the same line — every variant priced and timed.
 */
export function draftProblem(draft: VariantDraft): string | null {
  if (draft.axes.length === 0) {
    if (priceDigits(draft.flat.price) === null) {
      return "harganya belum diisi dengan benar";
    }
    if (durationValue(draft.flat.duration) === null) {
      return `durasinya belum diisi (1–${MAX_DURATION_MIN} menit)`;
    }
    return null;
  }

  const rows = buildVariantCombos(draft.axes).map((combo) =>
    rowOf(draft, combo.key),
  );
  const unpriced = rows.filter((row) => priceDigits(row.price) === null).length;
  if (unpriced > 0) return `${unpriced} varian belum punya harga yang benar`;

  const untimed = rows.filter((row) => durationValue(row.duration) === null).length;
  if (untimed > 0) {
    return `${untimed} varian belum punya durasi (1–${MAX_DURATION_MIN} menit)`;
  }

  return null;
}

/**
 * The PATCH a valid draft becomes. Exactly one half of the pricing is sent, the
 * rule `ServiceService#prepareVariantConfig` keeps: a price and a duration, or
 * axes and variants — a variant service sends no duration of its own.
 *
 * Call it only when `draftProblem` is null.
 */
export function draftPatch(draft: VariantDraft): UpdateServiceInput {
  const serviceLocations = PLACE_LOCATIONS[draft.place];

  if (draft.axes.length === 0) {
    return {
      serviceLocations,
      hasVariants: false,
      price: priceDigits(draft.flat.price) as string,
      durationMin: durationValue(draft.flat.duration) as number,
    };
  }

  return {
    serviceLocations,
    hasVariants: true,
    variantAxes: draft.axes,
    variants: buildVariantCombos(draft.axes).map((combo) => {
      const row = rowOf(draft, combo.key);

      return {
        petType: combo.petType,
        sizeCategory: combo.sizeCategory,
        furType: combo.furType,
        price: priceDigits(row.price) as string,
        durationMin: durationValue(row.duration) as number,
        isActive: row.active,
      };
    }),
  };
}

/**
 * What the draft says, normalised — two drafts with the same signature save the
 * same thing. "139.000" and "139000" are one price; rows of combinations the
 * current axes do not have are not part of it.
 */
export function draftSignature(draft: VariantDraft): string {
  const normalised = (row: DraftRow) => [
    priceDigits(row.price) ?? row.price.trim(),
    row.duration.trim(),
  ];

  return JSON.stringify({
    place: draft.place,
    axes: draft.axes,
    rows:
      draft.axes.length === 0
        ? null
        : buildVariantCombos(draft.axes).map((combo) => {
            const row = rowOf(draft, combo.key);
            return [...normalised(row), row.active];
          }),
    flat: draft.axes.length === 0 ? normalised(draft.flat) : null,
  });
}
