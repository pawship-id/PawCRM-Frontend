"use client";

import { useEffect, useState } from "react";

interface Loaded<T> {
  key: string;
  data: T | null;
  failed: boolean;
}

export interface RemoteState<T> {
  data: T | null;
  loading: boolean;
  /** True when the read failed — never folded into `data` as an empty answer. */
  failed: boolean;
}

/**
 * One read for one Beranda card.
 *
 * KEYED, like `useTodayBoard`: the answer belongs to the key it was asked
 * with, so a response that lands after the scope moved on is shown as loading
 * rather than as the new scope's figure.
 *
 * `enabled` IS THE GRANT. A card the role may not read asks nothing — calling
 * anyway would fire a request guaranteed to be refused on every page load.
 */
export function useRemote<T>(
  key: string,
  load: () => Promise<T>,
  enabled = true,
): RemoteState<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({
    key: "",
    data: null,
    failed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    load()
      .then((data) => {
        if (active) setLoaded({ key, data, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, data: null, failed: true });
      });

    return () => {
      active = false;
    };
    // `load` is a fresh closure every render; `key` is what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const current = enabled && loaded.key === key;
  return {
    data: current ? loaded.data : null,
    loading: enabled && !current,
    failed: current && loaded.failed,
  };
}
