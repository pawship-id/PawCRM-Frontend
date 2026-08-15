"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppliedFilter } from "./FilterChips";
import { FilterChips } from "./FilterChips";

/**
 * The horizontal arrangement: filters left, search right, actions after it —
 * or, once the triggers fill that line, search and the actions on a row of
 * their own beneath them (`searchPlacement`).
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
  /**
   * Whether search and the actions share the filters' line.
   *
   * "inline" is the default and what fourteen toolbars want: a bar of two or
   * three triggers has room to the right, and search pinned there is one line
   * for the whole thing.
   *
   * "own-row" gives the two a line of their own beneath the filters — search
   * left, actions right. Reach for it once the triggers themselves fill the
   * line: search wrapped by flex-wrap lands wherever there happened to be room,
   * and a search box that moves as filters are added and removed is one people
   * have to look for every time.
   *
   * The actions FOLLOW SEARCH wherever it goes. They are the two things on a
   * bar that are not filters, and splitting them across rows would leave the
   * primary action alone on a line with the triggers it has nothing to do with.
   */
  searchPlacement?: "inline" | "own-row";
  /**
   * Classes for the search's wrapper, for screens that want it to change shape
   * with the viewport — full width on a narrow one, pinned right on a wide one.
   */
  searchClassName?: string;
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
  searchPlacement = "inline",
  searchClassName,
  hint,
  chips,
  onClearAll,
  className,
}: FilterBarProps) {
  const ownRow = searchPlacement === "own-row";

  const trailing = (
    <>
      {search && (
        // On its own row search leads from the left, so the auto margin that
        // pins it right on a shared line would be pushing against nothing.
        <div className={cn(!meta && !ownRow && "ml-auto", searchClassName)}>
          {search}
        </div>
      )}
      {actions && (
        <div className={cn("flex shrink-0 gap-2", ownRow && "ml-auto")}>
          {actions}
        </div>
      )}
    </>
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {children}

        {meta && (
          <div className="ml-auto text-xs text-muted">{meta}</div>
        )}
        {!ownRow && trailing}
      </div>

      {ownRow && (
        <div className="flex flex-wrap items-center gap-2">{trailing}</div>
      )}

      {hint && <p className="text-xs text-muted">{hint}</p>}

      {chips && <FilterChips items={chips} onClearAll={onClearAll} />}
    </div>
  );
}
