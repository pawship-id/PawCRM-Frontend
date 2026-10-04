"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterOption } from "./codecs";
import { cn } from "@/lib/utils";

import { FilterField } from "./FilterField";
import { FilterOptionList } from "./FilterOptionList";
import { FilterTrigger } from "./FilterTrigger";
import {
  CLEAR_OF_SHELL_HEADER,
  useCloseBehindShellHeader,
} from "./popoverPlacement";

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
  /**
   * WHERE THIS CONTROL IS STANDING — the same four arrangements `FilterSelect`
   * has, and added here on 29 September 2026 for the same reason it has them.
   *
   *   inline / bar — a content-sized trigger on a filter row, reading
   *                  `Label: Value ⌄`. The default, and what every filter bar
   *                  in the app uses.
   *   field / form — the label moves ABOVE the control, which then fills its
   *                  column; `form` is 44px tall (ui-rules §16).
   *
   * WITHOUT THIS, A MULTI-SELECT IN A FORM WAS THE ODD ONE OUT. The benefit
   * scope form puts one under two ordinary `SelectField`s, and a pill trigger
   * carrying its own inline caption beside them read as a filter that had
   * wandered into the wrong screen — a different height, a different label
   * position, a different shape, for the same act of choosing.
   */
  layout?: "inline" | "bar" | "field" | "form";
  /** `field`/`form` only — renders the red asterisk on the caption above. */
  required?: boolean;
  /** `form` only. Red, announced, and it wins over `hint`. */
  error?: string;
  /** Explanatory line under the control, `field`/`form` only. */
  hint?: React.ReactNode;
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
  layout = "inline",
  required,
  error,
  hint,
  className,
}: FilterMultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = useCloseBehindShellHeader(open, setOpen);
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

  // The two layouts that hand their label to a `FilterField`. "inline" and
  // "bar" are both content-sized triggers standing on a row.
  const fieldLayout = layout === "field" || layout === "form";

  const control = (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <FilterTrigger
          ref={triggerRef}
          label={label}
          value={display}
          active={active}
          layout={layout}
          invalid={Boolean(error)}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={fieldLayout ? undefined : className}
        />
      </PopoverTrigger>

      <PopoverContent
        align={align}
        {...CLEAR_OF_SHELL_HEADER}
        // A field fills its column, so its list should too — anything narrower
        // reads as a stray popover rather than the field opening.
        className={cn(
          "p-0",
          fieldLayout && "w-(--radix-popover-trigger-width)",
        )}
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

  if (fieldLayout) {
    return (
      <FilterField
        label={label}
        required={required}
        error={error}
        hint={hint}
        className={className}
      >
        {control}
      </FilterField>
    );
  }

  return control;
}
