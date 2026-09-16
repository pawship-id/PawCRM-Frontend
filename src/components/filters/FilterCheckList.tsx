"use client";

import { Checkbox } from "@/components/ui/checkbox";

import { FilterField } from "./FilterField";

/**
 * A multi-select that lives INSIDE a `FilterPanel`.
 *
 * ITS TICKS WAIT FOR THE PANEL'S TERAPKAN, so it carries no Terapkan of its own
 * — which is exactly what makes it a different control from `FilterMultiSelect`,
 * a bar control that must apply itself (§8's decision table).
 *
 * PROMOTED from the Grooming board's toolbar, where it started as a private
 * helper. Hari Ini's panel wanted the same rows, which is §14's rule for
 * promotion and the point at which a copy would have started drifting.
 */
export interface FilterCheckListProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  values: T[];
  onChange: (values: T[]) => void;
  /** Said when there is nothing to pick — never an empty box. */
  empty?: string;
}

export function FilterCheckList<T extends string>({
  label,
  options,
  values,
  onChange,
  empty = "Tidak ada pilihan.",
}: FilterCheckListProps<T>) {
  return (
    <FilterField label={label}>
      {options.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul aria-label={label} className="flex flex-col">
          {options.map((option) => {
            const checked = values.includes(option.value);

            return (
              <li key={option.value}>
                {/* 44 px of row, per §1.5 — a tick is a touch target. */}
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      onChange(
                        next === true
                          ? [...values, option.value]
                          : values.filter((value) => value !== option.value),
                      )
                    }
                  />
                  {option.label}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </FilterField>
  );
}
