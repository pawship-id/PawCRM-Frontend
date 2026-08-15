/**
 * Option builders and formatters shared by the filter controls.
 *
 * These exist because three different "unset" conventions coexist in the
 * codebase and every toolbar used to hand-roll its own sentinel dance:
 *
 *   1. `"" ↔ "all"` — the majority. Radix Select forbids `value=""`, so each
 *      toolbar declared `const ALL = "all"`, mapped `"" → ALL` on the way in,
 *      and mapped it back with a cast on the way out.
 *   2. `boolean | ""` — the tri-state Active/Inactive/All filters.
 *   3. `"all"` as a genuine domain value, with no sentinel at all.
 *
 * FilterSelect renders its own listbox rather than a Radix Select, so the
 * empty-string ban is gone and convention 1 needs no dance. What survives is a
 * single question — which value means "not filtering" — answered by
 * `unsetValue` on the control, and by these builders on the option list.
 */

export interface FilterOption<T> {
  value: T;
  label: string;
  /** Shown as a trailing count, e.g. on pills. */
  count?: number;
  disabled?: boolean;
}

/**
 * Prefix the "no filter" row — `Semua kategori`, `Semua gudang`.
 *
 * `allValue` defaults to `""`, the repo's unset convention (never null, never
 * undefined). Pass it explicitly only when `""` is a real domain value.
 */
export function withAll<T>(
  options: FilterOption<T>[],
  allLabel: string,
  allValue: T = "" as T,
): FilterOption<T>[] {
  return [{ value: allValue, label: allLabel }, ...options];
}

/**
 * The Active / Inactive / All filter, whose value is `boolean | ""`.
 *
 * Returning real booleans is what lets the call site write
 * `onChange={(active) => onChange({ active })}` with no cast — the sentinel
 * round-trip was the only reason those casts existed.
 */
export function triState(labels: {
  all: string;
  yes: string;
  no: string;
}): FilterOption<boolean | "">[] {
  return [
    { value: "", label: labels.all },
    { value: true, label: labels.yes },
    { value: false, label: labels.no },
  ];
}

/**
 * `{ _id, name }[]` → options, for the six selects fed by fetched lookups.
 *
 * `label` overrides the display for cases like the warehouse pickers, which
 * suffix inactive rows with " (nonaktif)" so a filtered-out location is still
 * explicable rather than merely absent.
 */
export function namedOptions<T extends { _id: string; name: string }>(
  items: T[],
  label?: (item: T) => string,
): FilterOption<string>[] {
  return items.map((item) => ({
    value: item._id,
    label: label ? label(item) : item.name,
  }));
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ags",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/** "2026-08-01" → "1 Ags". Parsed as parts, not `new Date(iso)`, which is UTC. */
export function formatDateShort(iso: string): string {
  const [, month, day] = iso.split("-");
  const index = Number(month) - 1;
  if (!day || index < 0 || index > 11) return iso;
  return `${Number(day)} ${MONTHS[index]}`;
}

/** Both ends set → "1 Ags–14 Ags". One end → "sejak 1 Ags" / "sampai 14 Ags". */
export function formatRangeShort(from: string, to: string): string {
  if (from && to) return `${formatDateShort(from)}–${formatDateShort(to)}`;
  if (from) return `sejak ${formatDateShort(from)}`;
  if (to) return `sampai ${formatDateShort(to)}`;
  return "";
}
