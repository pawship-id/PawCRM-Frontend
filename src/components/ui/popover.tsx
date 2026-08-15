"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Imported from the unified `radix-ui` package, NOT `@radix-ui/react-popover`.
 * The shadcn CLI writes the latter, which would put a second copy of the same
 * primitive (and of react-popper) in the tree — every other file in this folder
 * imports from `radix-ui`, so this one does too.
 *
 * `modal` is left at its default of false on purpose: a modal popover pulls in
 * react-remove-scroll and traps the page, which a filter dropdown should not do.
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * `container` is Radix's own Portal prop, surfaced rather than added: the
 * wrapper swallowed it, and a popover opened from inside a modal Dialog needs
 * it. Radix locks scrolling with `RemoveScroll shards={[dialogContent]}`, so a
 * popover portaled to `document.body` sits OUTSIDE the one subtree allowed to
 * scroll and its own list silently refuses the wheel. Portaling into the dialog's
 * content puts it back inside the shard. Positioning is unaffected — Radix's
 * popper is `position: fixed`, so it neither joins the parent's layout nor is
 * clipped by it.
 */
function PopoverContent({
  className,
  align = "start",
  sideOffset = 8,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"];
}) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[220px] origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
