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
   *
   * The SAME control either way. The bar and the panel are two arrangements of
   * one grammar (docs/ui-rules.md §8), so a screen that has both — a quick bar
   * that collapses into a panel on a phone — renders one list of fields and
   * hands it a layout, rather than keeping two lists in step by hand.
   */
  layout?: "inline" | "field";
  disabled?: boolean;
  /**
   * Shown by the bar when this control is disabled. A control that greys out
   * with no explanation reads as a bug.
   */
  disabledHint?: string;
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
  disabled,
  disabledHint,
  align = "start",
  className,
}: FilterSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  // Null on a bar, the panel's element inside one — see useFilterPanelContainer.
  // Without it the option list cannot be scrolled inside a panel at all.
  const container = useFilterPanelContainer();

  const current = options.find((option) => Object.is(option.value, value));
  const active = !Object.is(value, unsetValue);
  const withSearch = searchable ?? options.length > 8;

  const control = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={label}
          // Falling back to the raw value keeps a stale id visible rather than
          // silently reading "Semua" while the list is still filtered by it.
          value={current?.label ?? (active ? String(value) : "Semua")}
          active={active}
          layout={layout}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={layout === "field" ? undefined : className}
        />
      </PopoverTrigger>

      <PopoverContent
        container={container ?? undefined}
        align={align}
        // A field fills its panel, so its list should too — anything narrower
        // reads as a stray popover rather than the field opening.
        className={cn("p-0", layout === "field" && "w-(--radix-popover-trigger-width)")}
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

  if (layout === "field") {
    return (
      <FilterField
        label={label}
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
