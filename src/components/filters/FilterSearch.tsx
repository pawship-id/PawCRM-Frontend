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
 */
export interface FilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Required: a placeholder disappears the moment someone types. */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

export function FilterSearch({
  value,
  onChange,
  placeholder = "Cari…",
  ariaLabel,
  disabled,
  className,
}: FilterSearchProps) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
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
