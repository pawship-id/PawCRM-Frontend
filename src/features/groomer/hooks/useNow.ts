"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking every second while `active` — for a stopwatch.
 *
 * `active` false stops the interval entirely, so a screen with nothing running
 * does not wake the phone every second for nothing.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}
