"use client";

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
 * Every filter at once, stacked and labeled, behind one Reset and one Terapkan.
 *
 * The second of the two arrangements in docs/ui-rules.md §8. A quick bar exists
 * so one click gives one result; a panel exists so the table does not re-query
 * three times while someone composes a query. WHICH ONE A SCREEN GETS IS
 * NORMALLY DECIDED BY COUNTING FIELDS — but it is also what a bar becomes when
 * the viewport runs out of room for it, which is the other caller here.
 *
 * A SHEET FROM THE BOTTOM, not a centred box. It is reached almost entirely from
 * a phone, where the bottom of the screen is the half a thumb can reach and a
 * centred dialog puts Terapkan under the keyboard. It stays anchored on a wide
 * screen too rather than growing a second personality, and simply caps its width.
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Undo the centred-box geometry DialogContent ships with: pinned to
          // the bottom edge, full bleed, and rounded only where it meets the
          // page. tailwind-merge drops the overridden halves.
          "top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0",
          "inset-x-0 mx-auto rounded-t-2xl rounded-b-none sm:max-w-140",
          "grid-rows-[auto_1fr_auto] gap-0 p-0",
          // The zoom the dialog uses reads as a box appearing in the middle;
          // a sheet slides up from the edge it is attached to.
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
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

        <div className="space-y-4 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="flex gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Reset is not the quiet text link it is inside a popover: on a
              sheet the two are one decision seen together, and a text button
              beside a filled one at this width reads as a caption. */}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={onReset}
          >
            Reset
          </Button>
          <Button type="button" size="lg" className="flex-1" onClick={onApply}>
            {applyLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
