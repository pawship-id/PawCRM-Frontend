"use client";

import * as React from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterOption } from "./codecs";
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
  disabled,
  align = "start",
  className,
}: FilterSelectProps<T>) {
  const [open, setOpen] = React.useState(false);

  const current = options.find((option) => Object.is(option.value, value));
  const active = !Object.is(value, unsetValue);
  const withSearch = searchable ?? options.length > 8;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={label}
          // Falling back to the raw value keeps a stale id visible rather than
          // silently reading "Semua" while the list is still filtered by it.
          value={current?.label ?? (active ? String(value) : "Semua")}
          active={active}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={className}
        />
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className="p-0"
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
}
