"use client";

import * as React from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The panel's own content element, for anything inside it that opens a portal.
 *
 * WHY A CONTEXT AND NOT JUST `document.body`. Radix locks scrolling on a modal
 * dialog with `RemoveScroll shards={[content]}` — exactly one subtree may be
 * scrolled while the dialog is up. A popover portaled to the body lands outside
 * that subtree, and its option list then refuses the wheel: the list scrolls in
 * the bar and not in the panel, for no reason a reader of either file could see.
 * Handing it the panel's element puts it back inside the shard.
 *
 * Null outside a panel, which is the ordinary case — a filter on a bar portals
 * to the body like anything else.
 */
const FilterPanelContainer = React.createContext<HTMLElement | null>(null);

/**
 * Where a control inside a `FilterPanel` should portal its popover.
 *
 * Pass the result straight to `PopoverContent`'s `container`. Outside a panel it
 * is null, which Radix reads as "the body" — so a call site does not have to
 * know which of the two it is in.
 */
export function useFilterPanelContainer() {
  return React.useContext(FilterPanelContainer);
}

/**
 * Every filter at once, stacked and labeled, behind one Reset and one Terapkan.
 *
 * The second of the two arrangements in docs/ui-rules.md §8. A quick bar exists
 * so one click gives one result; a panel exists so the table does not re-query
 * three times while someone composes a query. WHICH ONE A SCREEN GETS IS
 * NORMALLY DECIDED BY COUNTING FIELDS — but it is also what a bar becomes when
 * the viewport runs out of room for it, which is the other caller here.
 *
 * TWO SHAPES, ONE COMPONENT, split at `sm`. Geometry only, so it is CSS rather
 * than a JS branch and there is one tree either way.
 *
 *   phone — a SHEET from the bottom edge, full bleed. The bottom of the screen
 *           is the half a thumb can reach, and a centred box would put Terapkan
 *           under the keyboard.
 *   web   — a centred MODAL. The reason for the sheet is a thumb, and a mouse
 *           does not have one; a full-bleed strip pinned to the bottom of a
 *           1440px window reads as a cookie banner rather than as the thing the
 *           screen is now waiting on.
 *
 * THE FIELDS GO TWO ABREAST past `sm`, which is what the modal's width is for.
 * One per line would leave a tall thin column with nothing beside it; three
 * would make each too narrow to hold "Stok gudang: Semua gudang" without
 * truncating. On a phone it is one column and nothing changes.
 *
 * THE FIELDS INSIDE STAY DRAFT — that is the whole point of the arrangement, and
 * it is the caller that holds the draft: this component owns no field state, so
 * seeding on open and committing on Terapkan belong to whoever knows what a
 * field means. Reset is the one exception the rules carve out; it clears AND
 * applies in the same click, so it never leaves someone looking at a cleared
 * panel over an unchanged table.
 */
export interface FilterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default "Filter". */
  title?: string;
  /** `FilterField` stack. */
  children: ReactNode;
  onReset: () => void;
  onApply: () => void;
  /** Default "Terapkan". */
  applyLabel?: string;
  className?: string;
}

export function FilterPanel({
  open,
  onOpenChange,
  title = "Filter",
  children,
  onReset,
  onApply,
  applyLabel = "Terapkan",
  className,
}: FilterPanelProps) {
  // State rather than a ref: the children need to re-render once the element
  // exists, and a ref does not tell them it now does.
  const [content, setContent] = React.useState<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setContent}
        className={cn(
          // Phone: undo the centred-box geometry DialogContent ships with —
          // pinned to the bottom edge, full bleed, rounded only where it meets
          // the page. tailwind-merge drops the overridden halves.
          "inset-x-0 top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0",
          "rounded-t-2xl rounded-b-none",
          // Web: put that geometry back. `right-auto` is the one that is easy to
          // forget — `inset-x-0` set it to 0, and a box with left:50% and
          // right:0 stretches instead of centring.
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-2xl",
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "grid-rows-[auto_1fr_auto] gap-0 p-0",
          // A sheet slides up from the edge it is attached to; a modal appears
          // where it already is, which is the zoom the dialog ships with.
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
          "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
          "sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-bottom-2",
          className,
        )}
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-1">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          {/* The dialog's own close button sits here; this only reserves the
              room for it so a long title never runs underneath. */}
          <span aria-hidden className="size-6" />
        </header>

        {/* The panel is a set of controls, not prose — but a dialog without a
            description warns, and "what is this" is worth answering for a
            screen reader even when nothing is drawn. */}
        <DialogDescription className="sr-only">
          Atur filter, lalu tekan {applyLabel}.
        </DialogDescription>

        <div className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <FilterPanelContainer.Provider value={content}>
            {children}
          </FilterPanelContainer.Provider>
        </div>

        <footer className="flex gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end sm:pb-4">
          {/* Reset is not the quiet text link it is inside a popover: the two
              are one decision seen together here, and a text button beside a
              filled one at this width reads as a caption.

              Equal halves on a phone, where a thumb wants the whole width;
              sized to their labels and pushed right on the modal, where two
              buttons stretched across 672px would be the loudest thing on it. */}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1 sm:min-w-32 sm:flex-none"
            onClick={onReset}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1 sm:min-w-32 sm:flex-none"
            onClick={onApply}
          >
            {applyLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
