"use client";

import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { FilterOption } from "./codecs";
import { FilterField } from "./FilterField";
import { FilterTrigger } from "./FilterTrigger";

/**
 * A many-value field inside a FILTER PANEL, as a menu of checkboxes.
 *
 * PROMOTED FROM `ReceivablesToolbar` (12 October 2026) when Grooming's panel
 * needed several cabang too (ui-rules §14: promote on the second caller).
 *
 * NOT A FilterMultiSelect, for the reason `ProductsToolbar`'s WarehouseField
 * gives: that control carries its own Terapkan, and this one sits inside a panel
 * that already has one. The shell — FilterField and FilterTrigger — is shared,
 * so it lines up with the selects beside it.
 *
 * NOTHING TICKED IS "SEMUA", and that row is what the empty state looks like
 * rather than a separate mode.
 *
 * THE LIST IS HELD STILL WHILE THE MENU IS OPEN. Ticking a gudang ticks its
 * cabang, which narrows the gudang on offer; re-drawn mid-menu, the row somebody
 * was reaching for next would vanish under the pointer. The narrower list shows
 * the next time the menu opens.
 */
export function FilterCheckMenu<T extends string>({
  label,
  allLabel,
  unit,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  /** The noun a count past one reads as — "2 orang". */
  unit: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  const [heldOptions, setHeldOptions] = useState<FilterOption<T>[] | null>(
    null,
  );
  const shown = heldOptions ?? options;

  const names = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);

  const value =
    selected.length === 0
      ? allLabel
      : selected.length === 1 && names.length === 1
        ? names[0]
        : `${selected.length} ${unit}`;

  function toggle(option: T) {
    onChange(
      selected.includes(option)
        ? selected.filter((current) => current !== option)
        : [...selected, option],
    );
  }

  return (
    <FilterField label={label}>
      <DropdownMenu
        onOpenChange={(isOpen) => setHeldOptions(isOpen ? options : null)}
      >
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            layout="field"
            label={label}
            value={value}
            active={selected.length > 0}
            aria-label={`${label}: ${value}`}
            title={names.length > 1 ? names.join(", ") : undefined}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuCheckboxItem
            checked={selected.length === 0}
            onCheckedChange={() => onChange([])}
          >
            {allLabel}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {shown.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">
              Belum ada pilihan dari faktur yang ada.
            </p>
          ) : (
            shown.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterField>
  );
}
