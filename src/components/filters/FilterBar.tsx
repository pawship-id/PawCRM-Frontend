"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppliedFilter } from "./FilterChips";
import { FilterChips } from "./FilterChips";

/**
 * The horizontal arrangement: filters left, search right, actions after it —
 * or search leading the same line, or search and the actions on a row of their
 * own beneath the filters. See `searchPlacement`.
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
   * Where search sits relative to the filters.
   *
   * "inline" is the default and what fourteen toolbars want: a bar of two or
   * three triggers has room to the right, and search pinned there is one line
   * for the whole thing.
   *
   * "leading" puts search FIRST on that same line, ahead of the triggers, with
   * the actions pinned right. For a screen where narrowing usually starts by
   * typing a name rather than by picking a filter — reading order then matches
   * the order people actually work in.
   *
   * "own-row" gives search and the actions a line of their own beneath the
   * filters — search left, actions right. Reach for it once the triggers fill
   * the line themselves: search wrapped there by flex-wrap lands wherever there
   * happened to be room, and a box that moves as filters come and go is one
   * people have to look for every time.
   *
   * The actions FOLLOW SEARCH onto its own row, but never lead: they are the
   * one thing on a bar that is not about narrowing a list, so they sit at the
   * far end of whichever row they are on.
   */
  searchPlacement?: "inline" | "leading" | "own-row";
  /**
   * Classes for the search's wrapper, for screens that want it to change shape
   * with the viewport — full width on a narrow one, pinned right on a wide one.
   */
  searchClassName?: string;
  /**
   * Classes for the actions' wrapper. Its counterpart, and wanted for the same
   * reason: once flex-wrap has put the buttons on a line of their own, a button
   * hugging its label at one end of an empty row reads as something left over.
   */
  actionsClassName?: string;
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
  actionsClassName,
  hint,
  chips,
  onClearAll,
  className,
}: FilterBarProps) {
  const ownRow = searchPlacement === "own-row";
  const leading = searchPlacement === "leading";

  const searchSlot = search && (
    // The auto margin is what pins search right on a shared line. It is dropped
    // wherever search leads from the left instead, where it would be pushing
    // against nothing — or, worse, shoving the box it precedes.
    <div className={cn(!meta && !ownRow && !leading && "ml-auto", searchClassName)}>
      {search}
    </div>
  );

  const trailing = (
    <>
      {!leading && searchSlot}
      {actions && (
        <div
          className={cn(
            "flex shrink-0 gap-2",
            (ownRow || leading) && "ml-auto",
            actionsClassName,
          )}
        >
          {actions}
        </div>
      )}
    </>
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {leading && searchSlot}
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
