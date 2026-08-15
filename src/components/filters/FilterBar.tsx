"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppliedFilter } from "./FilterChips";
import { FilterChips } from "./FilterChips";

/**
 * The horizontal arrangement: filters left, search right, actions after it.
 *
 * Deliberately only flexbox. It knows nothing about any field, so a screen that
 * needs a layout this does not cover can drop it and render the same primitives
 * in its own div — the consistency lives in the controls, not in here.
 *
 * The slots are all `ReactNode` rather than config objects because ten of the
 * buttons that land in `actions` are wrapped in a `<Can>` permission gate. A
 * `{label, href}` shape would drag permissions into a shared component; a node
 * keeps that decision with the caller, where it belongs.
 */
export interface FilterBarProps {
  /** The filter triggers, in the order they matter. */
  children?: ReactNode;
  /** A rendered `<FilterSearch>`. Sits far right, apart from the filters. */
  search?: ReactNode;
  /** Result counts — "128 lot". */
  meta?: ReactNode;
  /** Create / Refresh / Export. Already permission-wrapped by the caller. */
  actions?: ReactNode;
  /** Explanatory text under the row, usually tied to a disabled control. */
  hint?: ReactNode;
  chips?: AppliedFilter[];
  onClearAll?: () => void;
  className?: string;
}

export function FilterBar({
  children,
  search,
  meta,
  actions,
  hint,
  chips,
  onClearAll,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {children}

        {meta && (
          <div className="ml-auto text-xs text-muted">{meta}</div>
        )}
        {search && <div className={cn(!meta && "ml-auto")}>{search}</div>}
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      {hint && <p className="text-xs text-muted">{hint}</p>}

      {chips && <FilterChips items={chips} onClearAll={onClearAll} />}
    </div>
  );
}
