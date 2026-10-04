"use client";

import { useState, type PointerEvent } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * The ⓘ beside a card label or a `<dt>`, for an explanation longer than a
 * caption — `StatTile`'s callers have no room for this, which is why it lives
 * next to it rather than inside it. PROMOTED from `CustomerSummaryScreen`'s
 * `SummaryTile` (2 October 2026) the day a second caller needed the same
 * thing (§14).
 *
 * HOVER OPENS IT EVERY TIME ON A MOUSE; A TAP OR A TAB OPENS IT EVERYWHERE
 * ELSE. Radix's `Popover` is click-only by default — correct for touch, but
 * it means a desktop reader would have to click an (i) that every other hover
 * tooltip on the web just opens under the pointer.
 *
 * `event.pointerType` ON THE POINTER EVENT ITSELF DECIDES IT (2 October 2026,
 * replacing an earlier `matchMedia("(hover: hover) and (pointer: fine)")`
 * check) — that was a one-time guess about the DEVICE, taken once and reused
 * for every hover after; this reads what actually produced THIS interaction,
 * per event, which is what "every time" requires. A touch tap and a real
 * mouse move both reach a `<button>`, but only the mouse one reports
 * `pointerType === "mouse"` — a hybrid touchscreen laptop, a VM, or a preview
 * frame that misreports hover capability no longer has a chance to leave
 * hover silently disconnected.
 *
 * FOCUS OPENS IT TOO, unconditionally, so a keyboard user gets the same
 * answer a mouse user does without needing to activate anything.
 *
 * PADDING IS NOT OPTIONAL ON `PopoverContent`. `ui/popover.tsx` ships none —
 * `PosDiscountPopover` hit the exact "text flush against the border" bug on
 * 28 September 2026, before this component existed to carry the fix once.
 *
 * `-m-1.5 p-1.5` ON THE TRIGGER grows the tap target around a 14px icon
 * without pushing the label it sits beside — short of the 44px floor (§1.5),
 * the same judgement call a control inside a dense row already makes
 * elsewhere (`ui-rules.md` §15, the `WarehouseProductPicker` note).
 *
 * FOCUS DARKENS THE ICON RATHER THAN RINGING IT (2 October 2026, on request).
 * §7's usual pair — navy border plus the orange halo — reads as an alarm
 * around something this small and round; it is also the one focus state in
 * the product that doesn't need a ring to prove it landed, because `onFocus`
 * above already opens the popover the moment it does. The colour change is
 * `outline-none`'s required `focus-visible:` replacement (§1.4), just not a
 * ring one.
 *
 * BOTH AUTO-FOCUS HANDLERS ARE SUPPRESSED (2 October 2026) — THE BUG BEHIND
 * "hover, then the second hover does nothing, then the third works". Radix's
 * `Popover.Content`, even non-modal, still runs a `FocusScope` that moves
 * real DOM focus INTO the content on open and back onto the trigger on
 * close. That close-time refocus fires this trigger's own `onFocus` — the
 * same handler hover relies on — which immediately called `setOpen(true)`
 * again right after a hover-driven close, leaving the popover's open state
 * out of step with where the pointer actually was until a third hover
 * happened to resync it. Hover and keyboard focus should drive `open`
 * directly and nothing else should move focus on their behalf, so both
 * auto-focus hooks are no-ops here.
 */
export function InfoTooltip({
  hint,
  className,
}: {
  /** The explanation, in full sentences — this is the only place it appears. */
  hint: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const openOnMouse = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") setOpen(true);
  };
  const closeOnMouse = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          onPointerEnter={openOnMouse}
          onPointerLeave={closeOnMouse}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={cn(
            "-m-1.5 flex-none cursor-pointer rounded-full p-1.5 text-muted outline-none transition hover:text-foreground focus-visible:text-foreground",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-72 max-w-[calc(100vw-2rem)] p-3 text-sm text-foreground"
      >
        {hint}
      </PopoverContent>
    </Popover>
  );
}
