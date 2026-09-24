"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

/** One entry a tahapan picker or a tahapan row can render. */
export interface ServiceStepChoice {
  /** The name — what `Service.sessions` stores. */
  value: string;
  /** The name, with a suffix when it cannot be added any more. */
  label: string;
  /**
   * Not addable: retired on the list, or not on the list at all (a name a
   * service stored while tahapan were free text). Shown only because a service
   * already holds it.
   */
  retired: boolean;
}

interface Snapshot {
  steps: ServiceStep[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: Snapshot = { steps: [], loaded: false, loading: false, error: null };

/*
  ONE LIST PER TENANT (22 September 2026 — it was per business line, then
  briefly per Kelompok layanan), cached once and shared by every consumer — the
  same bargain `usePetOptions` makes. A service's detail page draws the Tahapan
  card and the form may be a click away; neither should fetch the list twice.
  Writes call `invalidateServiceSteps()`.
*/
let snapshot: Snapshot = EMPTY;
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchList(): Promise<ServiceStep[]> {
  const items: ServiceStep[] = [];

  for (let page = 1; ; page += 1) {
    const result = await serviceStepService.list({ page, limit: 100 });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }

  return items;
}

function load(force = false) {
  if (!force && (snapshot.loading || snapshot.loaded)) return;

  const mine = ++generation;
  emit({ ...snapshot, loading: true, error: null });

  fetchList()
    .then((steps) => {
      if (generation !== mine) return;
      emit({ steps, loaded: true, loading: false, error: null });
    })
    .catch((error: unknown) => {
      if (generation !== mine) return;
      // Loaded even when it failed, so a mounted picker does not retry in a loop.
      emit({
        ...snapshot,
        loaded: true,
        loading: false,
        error:
          error instanceof ApiError
            ? error.message
            : "Gagal memuat daftar tahapan.",
      });
    });
}

/**
 * Drops the cached list after a create, rename, reorder, retire, delete or
 * restore. Mounted consumers refetch at once.
 */
export function invalidateServiceSteps() {
  generation += 1;
  snapshot = EMPTY;

  if (listeners.size > 0) {
    load(true);
  } else {
    listeners.forEach((listener) => listener());
  }
}

const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The tenant's tahapan list.
 *
 *   steps              — live steps (active and retired), in order.
 *   choices(keep?)     — what a picker offers: ACTIVE steps in order, plus any
 *                        name in `keep` (what the service already stores) that
 *                        is retired or not on the list, marked `retired`.
 *   stepFor(name)      — the live step a stored name resolves to, matched
 *                        case-insensitively, or undefined.
 */
export function useServiceSteps() {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );

  useEffect(() => {
    load();
  }, []);

  const steps = useMemo(
    () =>
      [...current.steps]
        .filter((step) => step.deletedAt === null)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id"),
        ),
    [current.steps],
  );

  const stepFor = useCallback(
    (name: string) => steps.find((step) => step.nameKey === keyOf(name)),
    [steps],
  );

  const choices = useCallback(
    (keep: string[] = []): ServiceStepChoice[] => {
      const active = steps
        .filter((step) => step.isActive)
        .map((step) => ({ value: step.name, label: step.name, retired: false }));

      const offered = new Set(active.map((choice) => keyOf(choice.value)));
      const kept = keep
        .filter((name) => name.trim() !== "" && !offered.has(keyOf(name)))
        .map((name) => {
          const step = stepFor(name);
          return {
            value: step?.name ?? name,
            label: step
              ? `${step.name} (nonaktif)`
              : `${name} (belum di daftar)`,
            retired: true,
          };
        });

      return [...active, ...kept];
    },
    [steps, stepFor],
  );

  const reload = useCallback(() => load(true), []);

  return {
    steps,
    loading: !current.loaded || current.loading,
    error: current.error,
    choices,
    stepFor,
    reload,
  };
}
