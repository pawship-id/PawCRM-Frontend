"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterOption } from "./codecs";
import { FilterOptionList } from "./FilterOptionList";
import { FilterTrigger } from "./FilterTrigger";

/**
 * A many-value filter, rendered as `Kategori (3) ⌄`.
 *
 * Unlike a single select, ticking an option neither applies nor closes — people
 * tick several boxes before they mean any of it. So this always carries its own
 * Reset and Terapkan, wherever it sits. The draft is seeded from `values` each
 * time the popover opens, so abandoning it by clicking away changes nothing.
 *
 * Reset applies immediately rather than waiting for Terapkan, which is the rule
 * at every level: clearing a filter is not a change you compose.
 */
export interface FilterMultiSelectProps<T> {
  label: string;
  values: T[];
  options: FilterOption<T>[];
  onApply: (values: T[]) => void;
  onReset: () => void;
  ariaLabel?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Overrides the `(3)` count in the trigger. */
  formatValue?: (values: T[], options: FilterOption<T>[]) => string;
  align?: "start" | "end";
  className?: string;
}

export function FilterMultiSelect<T>({
  label,
  values,
  options,
  onApply,
  onReset,
  ariaLabel,
  searchable,
  disabled,
  formatValue,
  align = "start",
  className,
}: FilterMultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<T[]>(values);

  function onOpenChange(next: boolean) {
    if (next) setDraft(values);
    setOpen(next);
  }

  function toggle(value: T) {
    setDraft((prev) =>
      prev.some((v) => Object.is(v, value))
        ? prev.filter((v) => !Object.is(v, value))
        : [...prev, value],
    );
  }

  const active = values.length > 0;
  const display = formatValue
    ? formatValue(values, options)
    : active
      ? `(${values.length})`
      : "Semua";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={label}
          value={display}
          active={active}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={className}
        />
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className="p-0"
        // See FilterSelect: Radix would focus the content wrapper, which sits
        // above the listbox's key handler.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <FilterOptionList
          options={options}
          selected={draft}
          multiple
          searchable={searchable ?? options.length > 8}
          searchLabel={`Cari ${label.toLowerCase()}`}
          onPick={toggle}
        />

        <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              setDraft([]);
              onReset();
              setOpen(false);
            }}
            className="rounded-sm text-sm font-semibold text-warning outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reset
          </button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
