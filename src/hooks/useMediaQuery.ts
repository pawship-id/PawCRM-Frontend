"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * FOR LAYOUTS CSS CANNOT EXPRESS, not for hiding things. A `hidden md:flex` pair
 * is still the right answer when both arrangements are the same controls — this
 * exists for the case where the narrow layout is a genuinely DIFFERENT tree, as
 * with a filter bar that collapses into a panel: rendering both and hiding one
 * would put two controls with the same accessible name on the page, which is a
 * bug for a screen reader long before it is one for a test.
 *
 * `useSyncExternalStore` rather than an effect, so there is one subscription and
 * no first-paint flash of the wrong branch beyond hydration itself.
 *
 * THE FALLBACK IS THE ANSWER BEFORE THE BROWSER CAN BE ASKED — on the server,
 * and under jsdom, which has no `matchMedia` at all. Pass the wide layout's
 * value: a phone corrects itself on hydration, whereas prerendering the narrow
 * branch would make every desktop load start collapsed.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};

      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  }, [query, fallback]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
