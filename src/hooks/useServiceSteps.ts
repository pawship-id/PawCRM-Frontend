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
  ONE CACHE PER BUSINESS LINE, shared by every consumer — the same bargain
  `usePetOptions` makes. A service's detail page draws the Tahapan card and the
  form may be a click away; neither should fetch its line's list twice. Writes
  call `invalidateServiceSteps(lineId)`.
*/
const cache = new Map<string, Snapshot>();
const generations = new Map<string, number>();
const listeners = new Set<() => void>();

function emit(lineId: string, next: Snapshot) {
  cache.set(lineId, next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchLine(lineId: string): Promise<ServiceStep[]> {
  const items: ServiceStep[] = [];

  for (let page = 1; ; page += 1) {
    const result = await serviceStepService.list({
      businessLineId: lineId,
      page,
      limit: 100,
    });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }

  return items;
}

function load(lineId: string, force = false) {
  const current = cache.get(lineId) ?? EMPTY;
  if (!force && (current.loading || current.loaded)) return;

  const mine = (generations.get(lineId) ?? 0) + 1;
  generations.set(lineId, mine);
  emit(lineId, { ...current, loading: true, error: null });

  fetchLine(lineId)
    .then((steps) => {
      if (generations.get(lineId) !== mine) return;
      emit(lineId, { steps, loaded: true, loading: false, error: null });
    })
    .catch((error: unknown) => {
      if (generations.get(lineId) !== mine) return;
      // Loaded even when it failed, so a mounted picker does not retry in a loop.
      emit(lineId, {
        ...(cache.get(lineId) ?? EMPTY),
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
 * Drops a line's cached list — or every line's — after a create, rename,
 * reorder, retire, delete or restore. Mounted consumers refetch at once.
 */
export function invalidateServiceSteps(lineId?: string) {
  const lines = lineId ? [lineId] : [...cache.keys()];

  lines.forEach((line) => {
    generations.set(line, (generations.get(line) ?? 0) + 1);
    cache.delete(line);
  });

  if (listeners.size > 0) {
    lines.forEach((line) => load(line, true));
  } else {
    listeners.forEach((listener) => listener());
  }
}

const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A business line's tahapan list.
 *
 *   steps              — live steps (active and retired), in order.
 *   choices(keep?)     — what a picker offers: ACTIVE steps in order, plus any
 *                        name in `keep` (what the service already stores) that
 *                        is retired or not on the list, marked `retired`.
 *   stepFor(name)      — the live step a stored name resolves to, matched
 *                        case-insensitively, or undefined.
 *
 * `businessLineId` null or empty asks for nothing — a new service with no line
 * chosen has no list yet.
 */
export function useServiceSteps(businessLineId: string | null | undefined) {
  const lineId = businessLineId ?? "";

  const snapshot = useSyncExternalStore(
    subscribe,
    () => (lineId ? (cache.get(lineId) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (lineId) load(lineId);
  }, [lineId]);

  const steps = useMemo(
    () =>
      [...snapshot.steps]
        .filter((step) => step.deletedAt === null)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id"),
        ),
    [snapshot.steps],
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

  const reload = useCallback(() => {
    if (lineId) load(lineId, true);
  }, [lineId]);

  return {
    steps,
    loading: lineId !== "" && (!snapshot.loaded || snapshot.loading),
    error: snapshot.error,
    choices,
    stepFor,
    reload,
  };
}
