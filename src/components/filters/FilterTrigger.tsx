"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The shell every filter control opens from: `Gudang: Semua ⌄`.
 *
 * THIS FILE IS THE POINT OF THE WHOLE FOLDER. Every trigger in the app renders
 * through it, so changing how a filter looks is one `cn()` call here rather
 * than fifteen toolbars that had drifted into `w-36`, `w-40`, `w-44`, `w-48`,
 * `w-52` and `w-56`. It is exported publicly so the one control that cannot be
 * expressed declaratively — the product catalogue's warehouse scope, which
 * writes to a different setter than the query — still wears the same shell.
 *
 * Width is derived from content (`max-w-[240px] truncate`), never guessed.
 */
export interface FilterTriggerProps
  extends Omit<React.ComponentProps<"button">, "children" | "value"> {
  /** The left half — "Gudang". */
  label: string;
  /**
   * The right half. A string, never a node: a filter's current value has to be
   * readable as text for the trigger to be announced sensibly.
   *
   * OMITTED FOR A TRIGGER THAT HAS NO ONE VALUE — "Filter lain", which opens a
   * subset panel rather than a list. That one reads as its label alone, and
   * drops the chevron with it: there is no value for it to point at.
   */
  value?: string;
  /** Whether a filter is actually applied. Drives the navy state. */
  active?: boolean;
  /** Leading icon, e.g. a calendar on the date range. */
  icon?: React.ReactNode;
  /**
   * "inline" — the bar's `Gudang: Semua ⌄`, sized to its content.
   * "field" — inside a `FilterField`, where the name is already drawn above:
   * full width, value only, chevron pushed to the far edge.
   */
  layout?: "inline" | "field";
  "aria-label": string;
}

export const FilterTrigger = React.forwardRef<
  HTMLButtonElement,
  FilterTriggerProps
>(function FilterTrigger(
  { label, value, active = false, icon, layout = "inline", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-active={active}
      className={cn(
        // `group` so the label and chevron can react to this button's own
        // data-active / data-state (Radix sets the latter via asChild).
        "group inline-flex h-10 min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm transition",
        layout === "field"
          ? "w-full justify-between"
          : "max-w-60 shrink-0",
        "hover:border-input-hover",
        // Focus is a pair: the orange halo alone is 2.33:1 on white and misses
        // the 3:1 non-text floor. See docs/ui-rules.md §7.
        "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[active=true]:border-transparent data-[active=true]:bg-navy-100 data-[active=true]:text-primary",
        "data-[state=open]:border-primary data-[state=open]:ring-[3px] data-[state=open]:ring-ring/50",
        className,
      )}
      {...props}
    >
      {icon}
      {value === undefined ? (
        <span className="truncate font-medium">{label}</span>
      ) : (
        <>
          {layout === "inline" && (
            <span className="shrink-0 text-muted group-data-[active=true]:text-primary">
              {label}:
            </span>
          )}
          <span className="truncate font-medium">{value}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted transition-transform group-data-[active=true]:text-primary group-data-[state=open]:rotate-180" />
        </>
      )}
    </button>
  );
});
