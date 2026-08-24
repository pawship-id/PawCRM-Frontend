"use client";

import * as React from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FilterOption } from "./codecs";
import { FilterField } from "./FilterField";
import { useFilterPanelContainer } from "./FilterPanel";
import { FilterOptionList } from "./FilterOptionList";
import { FilterTrigger } from "./FilterTrigger";

/**
 * A single-value filter, rendered as `Gudang: Semua ⌄`.
 *
 * Picking applies immediately and closes: one click, one result. That is the
 * rule for a select standing alone in a bar — only multi-select and date range
 * hold a draft, because those are the ones people compose before they mean it.
 *
 * Not a native `<select>` and not a Radix Select. A popover is what lets a long
 * list carry its own search box (the stock card's product picker needs it), and
 * it drops the empty-string ban that forced twelve toolbars to invent an "all"
 * sentinel and cast their way back out of it.
 */
export interface FilterSelectProps<T> {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
  /**
   * Which value means "not filtering". Defaults to `""`, the repo's unset
   * convention. Pass it when "all" is a genuine domain value instead.
   *
   * `NoInfer` so this does not vote on what `T` is. Without it a bare
   * `unsetValue="all"` widens the inference to `string` and the call site has
   * to cast — which is the very thing moving off the sentinel removed.
   */
  unsetValue?: NoInfer<T>;
  /** Defaults to `label`. */
  ariaLabel?: string;
  /** In-popover search. Turns itself on past eight options unless set. */
  searchable?: boolean;
  /**
   * "inline" — a trigger in a `FilterBar`, reading `Gudang: Semua ⌄`.
   * "field" — a labeled full-width row inside a `FilterPanel`.
   * "form" — the same row standing in a FORM: 44px, and `error` is honoured.
   *
   * The SAME control either way. The bar and the panel are two arrangements of
   * one grammar (docs/ui-rules.md §8), so a screen that has both — a quick bar
   * that collapses into a panel on a phone — renders one list of fields and
   * hands it a layout, rather than keeping two lists in step by hand.
   */
  layout?: "inline" | "field" | "form";
  /**
   * Overrides the applied-filter state the trigger shows.
   *
   * Normally derived: a value other than `unsetValue` means a filter is on, and
   * the trigger goes navy. A control that is a CHOICE rather than a filter — the
   * warehouse an opname sheet will be opened for, which always has a value —
   * would then be permanently navy, announcing an applied filter on a form.
   * `active={false}` says there is no such thing here.
   */
  active?: boolean;
  /**
   * What the trigger reads when nothing is chosen yet. Defaults to "Semua",
   * which is what an unset FILTER means — a required input means "Pilih gudang"
   * instead, and saying "Semua" there would claim a choice nobody made.
   */
  placeholder?: string;
  /** Marks the choice as wrong — see FilterTrigger. */
  invalid?: boolean;
  /**
   * Red `*` on the caption. `layout="field"` only — a bar filter has no such
   * thing, and the inline trigger has no caption to hang it on.
   */
  required?: boolean;
  disabled?: boolean;
  /**
   * Shown by the bar when this control is disabled. A control that greys out
   * with no explanation reads as a bug.
   */
  disabledHint?: string;
  /**
   * Validation message, `layout="form"` only — a filter cannot be invalid.
   *
   * Setting it also marks the trigger `invalid`, so the red border and the red
   * sentence can never disagree about whether something is wrong.
   */
  error?: string;
  align?: "start" | "end";
  className?: string;
}

export function FilterSelect<T>({
  label,
  value,
  options,
  onChange,
  unsetValue = "" as T,
  ariaLabel,
  searchable,
  layout = "inline",
  active: activeOverride,
  placeholder,
  invalid,
  required,
  disabled,
  disabledHint,
  error,
  align = "start",
  className,
}: FilterSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  // Null on a bar, the panel's element inside one — see useFilterPanelContainer.
  // Without it the option list cannot be scrolled inside a panel at all.
  const container = useFilterPanelContainer();

  const current = options.find((option) => Object.is(option.value, value));
  // Whether a value is SET, which is not the same question as whether a filter
  // is applied — `active` may be overridden for a control that is a choice
  // rather than a filter, and the stale-id fallback below must not follow it.
  const chosen = !Object.is(value, unsetValue);
  const active = activeOverride ?? chosen;
  const withSearch = searchable ?? options.length > 8;

  // Falling back to the raw value keeps a stale id visible rather than silently
  // reading "Semua" while the list is still filtered by it.
  const display =
    current?.label ?? (chosen ? String(value) : (placeholder ?? "Semua"));

  const control = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={label}
          value={display}
          active={active}
          layout={layout}
          invalid={invalid ?? Boolean(error)}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={layout === "inline" ? className : undefined}
        />
      </PopoverTrigger>

      <PopoverContent
        container={container ?? undefined}
        align={align}
        // A field fills its panel, so its list should too — anything narrower
        // reads as a stray popover rather than the field opening.
        className={cn(
          "p-0",
          layout !== "inline" && "w-(--radix-popover-trigger-width)",
        )}
        // Radix parks focus on the content wrapper, which is the ANCESTOR of
        // the listbox — so arrow keys would fire above the handler and never
        // reach it. Decline that and let the list (or its search box) take focus.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <FilterOptionList
          options={options}
          selected={[value]}
          searchable={withSearch}
          searchLabel={`Cari ${label.toLowerCase()}`}
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );

  if (layout !== "inline") {
    return (
      <FilterField
        label={label}
        required={required}
        error={error}
        // Only while it is actually greyed out: a permanent caption explaining
        // a state the field is not in reads as a warning about nothing. This is
        // the prop's first use — it was declared with the interface and left
        // dead, because on a bar the explanation went to FilterBar's `hint`.
        hint={disabled ? disabledHint : undefined}
        className={className}
      >
        {control}
      </FilterField>
    );
  }

  return control;
}
