"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilterOption } from "./codecs";

/**
 * The option list inside a filter popover, with optional in-popover search.
 *
 * Hand-rolled rather than `cmdk`, for three reasons. The work is one
 * `.includes()` over a list the lookup hooks already cap at 100 — a tenant has
 * tens of vendors, not thousands — so cmdk's scoring and virtualisation solve
 * problems this app does not have. cmdk also identifies options by a stringly
 * `value`, which would reintroduce exactly the sentinel round-trip that moving
 * off Radix Select just deleted. And a plain `<ul role="listbox">` is queryable
 * with `getByRole("option", { name })`, the idiom the existing screen tests
 * already use.
 *
 * Keyboard: arrows move an `aria-activedescendant` cursor, Enter picks, and
 * Home/End jump. Focus stays on the search box (or the trigger) throughout, so
 * typing and navigating never fight over it.
 */
export interface FilterOptionListProps<T> {
  options: FilterOption<T>[];
  /** Values currently ticked. One entry for a single select. */
  selected: T[];
  onPick: (value: T) => void;
  /** Round marks read as "one of", square as "several of". */
  multiple?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Announced on the search box; the placeholder is not a label. */
  searchLabel?: string;
  emptyLabel?: string;
}

export function FilterOptionList<T>({
  options,
  selected,
  onPick,
  multiple = false,
  searchable = false,
  searchPlaceholder = "Cari…",
  searchLabel = "Cari pilihan",
  emptyLabel = "Tidak ada pilihan yang cocok",
}: FilterOptionListProps<T>) {
  const [term, setTerm] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);

  // With no search box there is nothing in here to hold focus, and the popover
  // declines Radix's auto-focus (it would land on the content wrapper, above
  // this component's key handler). React's `autoFocus` does not fire on a plain
  // <ul>, so take focus explicitly.
  React.useEffect(() => {
    if (!searchable) listRef.current?.focus();
  }, [searchable]);

  const visible = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, term]);

  // Clamped during render rather than corrected in an effect: filtering can
  // shrink the list under the cursor, and re-rendering twice to fix that is
  // both slower and a lint error.
  const lastIndex = Math.max(0, visible.length - 1);
  const activeIndex = Math.min(cursor, lastIndex);

  const isSelected = (option: FilterOption<T>) =>
    selected.some((value) => Object.is(value, option.value));

  function move(delta: number) {
    if (!visible.length) return;
    const next = activeIndex + delta;
    if (next < 0) setCursor(lastIndex);
    else if (next > lastIndex) setCursor(0);
    else setCursor(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(lastIndex);
    } else if (event.key === "Enter") {
      const option = visible[activeIndex];
      if (option && !option.disabled) {
        event.preventDefault();
        onPick(option.value);
      }
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      {searchable && (
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setCursor(0);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            aria-controls={listId}
            aria-activedescendant={
              visible.length ? `${listId}-opt-${activeIndex}` : undefined
            }
            className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted"
          />
        </div>
      )}

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-activedescendant={
          visible.length ? `${listId}-opt-${activeIndex}` : undefined
        }
        tabIndex={searchable ? undefined : -1}
        className="max-h-70 overflow-y-auto p-1.5 outline-none"
      >
        {visible.map((option, index) => {
          const active = isSelected(option);
          return (
            <li
              key={String(option.value)}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={active}
              aria-disabled={option.disabled || undefined}
              data-cursor={index === activeIndex}
              onClick={() => !option.disabled && onPick(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                "hover:bg-surface-hover data-[cursor=true]:bg-surface-hover",
                option.disabled && "pointer-events-none opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center border-[1.5px] border-border",
                  multiple ? "rounded-[5px]" : "rounded-full",
                  active && "border-primary bg-primary",
                )}
              >
                <Check
                  className={cn(
                    "size-2.5 text-primary-foreground",
                    !active && "opacity-0",
                  )}
                  strokeWidth={3}
                />
              </span>
              <span className="truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="ml-auto text-xs text-muted">
                  {option.count}
                </span>
              )}
            </li>
          );
        })}

        {!visible.length && (
          <li className="px-2.5 py-6 text-center text-sm text-muted">
            {emptyLabel}
          </li>
        )}
      </ul>
    </div>
  );
}
