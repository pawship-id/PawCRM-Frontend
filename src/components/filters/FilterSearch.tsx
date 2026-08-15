"use client";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The free-text box. Controlled and deliberately dumb.
 *
 * NO DEBOUNCE HERE. Debouncing belongs in the calling hook — see
 * `useDebouncedQuery` — so the input stays instantly responsive while only the
 * network waits. A component that swallowed keystrokes would make every caller
 * fight it to read its own value.
 *
 * IT CAPS ITSELF AT 320px past `sm`, which is right for a box sharing a line
 * with three filter triggers and wrong for one that is meant to take the rest of
 * the row. Widen it with `fill`, NOT with a className: the cap lives behind an
 * `sm:` modifier, tailwind-merge cannot merge across modifiers, and a passed
 * `max-w-none` therefore loses to it silently above 640px — a bug that looks
 * like the flex parent not growing and has been written twice already.
 */
export interface FilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Required: a placeholder disappears the moment someone types. */
  ariaLabel: string;
  /**
   * Drop the 320px cap and take whatever the parent gives it.
   *
   * For a bar where search is the only thing on the line that can grow — the
   * catalogue's, where every filter has collapsed into one button — so what is
   * typed into it (product names) is not truncated mid-word by a width chosen
   * for a row that no longer exists.
   */
  fill?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FilterSearch({
  value,
  onChange,
  placeholder = "Cari…",
  ariaLabel,
  fill = false,
  disabled,
  className,
}: FilterSearchProps) {
  return (
    <div className={cn("relative w-full", !fill && "sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "h-10 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm transition",
          "placeholder:text-muted hover:border-input-hover",
          "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    </div>
  );
}
