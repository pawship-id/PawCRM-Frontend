"use client";

import { useEffect, useSyncExternalStore } from "react";

import { ApiError } from "@/services/api-error";

/**
 * A list the whole app loads ONCE and shares — the `usePetOptions` store,
 * written generically for the lists that followed it (Opsi Varian cards,
 * zones). A module-level snapshot behind `useSyncExternalStore`: every consumer
 * gets the same array, and a settings screen calls `invalidate()` after a write
 * so mounted consumers refetch at once.
 */
export interface ListState<T> {
  items: T[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export function createListStore<T>(fetchAll: () => Promise<T[]>, failure: string) {
  const INITIAL: ListState<T> = { items: [], loaded: false, loading: false, error: null };

  let snapshot = INITIAL;
  let generation = 0;
  let inflight = false;
  const listeners = new Set<() => void>();

  const emit = (next: ListState<T>) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const load = (force = false) => {
    if (inflight && !force) return;
    if (snapshot.loaded && !force) return;

    const mine = ++generation;
    inflight = true;
    emit({ ...snapshot, loading: true, error: null });

    fetchAll()
      .then((items) => {
        if (mine !== generation) return;
        emit({ items, loaded: true, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (mine !== generation) return;
        // Loaded even when it failed, so a mounted consumer does not retry in a loop.
        emit({
          ...snapshot,
          loaded: true,
          loading: false,
          error: error instanceof ApiError ? error.fullMessage : failure,
        });
      })
      .finally(() => {
        if (mine === generation) inflight = false;
      });
  };

  /** Drop the cached list; mounted consumers refetch at once, the rest on mount. */
  const invalidate = () => {
    generation += 1;
    inflight = false;

    if (listeners.size > 0) {
      // Keep what is on screen while the fresh list arrives — no flash of empty.
      load(true);
    } else {
      emit(INITIAL);
    }
  };

  const useList = (): ListState<T> & { reload: () => void } => {
    const state = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL);

    useEffect(() => {
      load();
    }, []);

    return { ...state, reload: () => load(true) };
  };

  return { useList, invalidate };
}
