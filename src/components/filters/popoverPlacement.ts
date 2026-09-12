import * as React from "react";

/**
 * Keeps a filter popover from riding up over DashboardShell's header.
 *
 * The header is `fixed top-0 z-50 h-14`, and a popover is also `z-50` but
 * portaled later into `<body>` — so it paints on top. Radix's popper is
 * `position: fixed` and follows its trigger as the page scrolls, which left an
 * open list sliding over the navbar once the trigger had gone under it.
 */

/** DashboardShell's `h-14`. Change both together. */
export const SHELL_HEADER_HEIGHT = 56;

/**
 * Spread onto `PopoverContent`. Treats the header's strip as outside the
 * viewport, so a list that opened UPWARD flips below its trigger rather than
 * climbing over the navbar.
 *
 * NOT `hideWhenDetached`. It was tried first: it measures the trigger, and
 * under jsdom every rect is zero, so every popover in every test rendered
 * `visibility: hidden` and no option could be found.
 */
export const CLEAR_OF_SHELL_HEADER = {
  collisionPadding: { top: SHELL_HEADER_HEIGHT },
} as const;

/**
 * Closes the popover once its trigger has scrolled behind the header — the
 * list hangs below the trigger, so from there on it can only be covering the
 * navbar. Returns the ref to put on the trigger.
 *
 * A CAPTURING listener on `document`, because a scroll event does not bubble:
 * this hears the window and any scrolling container alike. Scrolling the option
 * list itself is heard too, and is harmless — it does not move the trigger.
 *
 * `setOpen` is a state setter, so the listener is not re-bound every render.
 */
export function useCloseBehindShellHeader(
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function onScroll() {
      const trigger = triggerRef.current;
      if (
        trigger &&
        trigger.getBoundingClientRect().bottom <= SHELL_HEADER_HEIGHT
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("scroll", onScroll, { capture: true });
  }, [open, setOpen]);

  return triggerRef;
}
