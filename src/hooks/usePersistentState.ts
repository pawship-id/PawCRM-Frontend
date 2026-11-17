"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * `useState` that SURVIVES LEAVING THE PAGE — for a list's filters (17 November
 * 2026, on request).
 *
 * Opening a row's detail and coming back used to land on an unfiltered list:
 * every list kept its filters in plain `useState`, which unmounts with the
 * route. A filter now stays on until the reader resets it — Reset hands the
 * default back, and the default is what gets remembered from then on.
 *
 * ─── WHERE IT LIVES ────────────────────────────────────────────────────────
 *
 * `sessionStorage`, under `buloo.list.<key>`: per browser tab, so two tabs keep
 * two sets of filters, and closing the tab forgets them. Signing out clears
 * every key (`clearPersistentState`) so the next user of this browser does not
 * open on somebody else's cabang.
 *
 * Read in the lazy initializer, which is safe from hydration mismatches here
 * only because the dashboard renders its screens after `useAuth` settles on
 * the client — no list screen is server-rendered with content.
 *
 * ─── SHAPE CHANGES ─────────────────────────────────────────────────────────
 *
 * A stored plain object is merged OVER the default, so a field added to a
 * query after somebody's filters were saved arrives with its default instead
 * of `undefined`. Anything unreadable falls back to the default.
 *
 * ─── DEEP LINKS ────────────────────────────────────────────────────────────
 *
 * `fresh: true` ignores what is stored and starts from `initial` — for a
 * screen opened by a link that carries its own filter (`?createdSince=`,
 * `?documentId=`), where the link's intent beats yesterday's filters. The value
 * is still saved, so coming back from a detail keeps the deep link's filter.
 */
const PREFIX = "buloo.list.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function readStored(key: string): { value: unknown } | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { value: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the filter still works, it just won't survive.
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  options: { fresh?: boolean } = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback =
      typeof initial === "function" ? (initial as () => T)() : initial;
    if (options.fresh || typeof window === "undefined") return fallback;

    const stored = readStored(key);
    if (!stored) return fallback;

    if (isPlainObject(fallback)) {
      return isPlainObject(stored.value)
        ? ({ ...fallback, ...stored.value } as T)
        : fallback;
    }
    // A primitive or an array must at least be the same kind as the default.
    if (Array.isArray(fallback) !== Array.isArray(stored.value)) return fallback;
    if (
      fallback !== null &&
      !Array.isArray(fallback) &&
      typeof fallback !== typeof stored.value
    ) {
      return fallback;
    }
    return stored.value as T;
  });

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}

/** Forget every list's remembered filters — on sign-out. */
export function clearPersistentState() {
  try {
    const storage = window.sessionStorage;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Nothing stored, or storage blocked — nothing to forget.
  }
}
