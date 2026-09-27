"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import type { PetOption, PetOptionType } from "@/types/api";

/**
 * The words every tenant is seeded with — mirrors DEFAULT_PET_OPTIONS in
 * petOption.model.js.
 *
 * THE LABEL OF LAST RESORT, not a list anybody picks from: what `label()` says
 * before the tenant's own list has loaded, or when it cannot. A shop that has
 * renamed "Kecil" sees its own word the moment the list arrives.
 *
 * KEYED BY THE OLD CODE, which is why it reaches less far than it used to: a
 * stored value is an `_id` now (see `label()`), and no fixed table can name an
 * id. It still answers for the residual codes on pre-25-September documents.
 */
export const DEFAULT_PET_OPTION_LABELS: Record<
  PetOptionType,
  Record<string, string>
> = {
  species: { cat: "Kucing", dog: "Anjing" },
  breed: { domestic: "Domestic", poodle: "Poodle" },
  size: { small: "Kecil", medium: "Sedang", large: "Besar" },
  furType: { "long hair": "Bulu panjang", "short hair": "Bulu pendek" },
};

/** One entry a select can render. */
export interface PetOptionChoice {
  /** The option's `_id` — what gets saved. */
  value: string;
  /** The word, with " (nonaktif)" appended when the option is retired. */
  label: string;
  /** Retired (or deleted, or unknown): kept only because the record holds it. */
  retired: boolean;
}

interface Snapshot {
  /** Every option the tenant has, soft-deleted ones included (for labels). */
  options: PetOption[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL: Snapshot = {
  options: [],
  loaded: false,
  loading: false,
  error: null,
};

/*
  ONE LIST FOR THE WHOLE APP, not one fetch per component.

  A booking screen draws a species badge per animal, a size per animal and a
  price grid — a fetch per consumer would be a dozen identical requests for a
  list that changes a few times a year. A module-level store behind
  `useSyncExternalStore` loads it once and hands every consumer the same array;
  the settings screen calls `invalidatePetOptions()` after a write.
*/
let snapshot: Snapshot = INITIAL;
let generation = 0;
let inflight = false;
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

const getSnapshot = () => snapshot;
const getServerSnapshot = () => INITIAL;

/** Every page — a tenant's four lists fit in one, but nothing promises that. */
async function fetchAll(): Promise<PetOption[]> {
  const items: PetOption[] = [];

  for (let page = 1; ; page += 1) {
    const result = await petOptionService.list({
      page,
      limit: 100,
      includeDeleted: true,
    });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }

  return items;
}

function load(force = false) {
  if (inflight && !force) return;
  if (snapshot.loaded && !force) return;

  const mine = ++generation;
  inflight = true;
  emit({ ...snapshot, loading: true, error: null });

  fetchAll()
    .then((options) => {
      if (mine !== generation) return;
      emit({ options, loaded: true, loading: false, error: null });
    })
    .catch((error: unknown) => {
      if (mine !== generation) return;
      /*
        LOADED EVEN WHEN IT FAILED, so a mounted consumer does not retry in a
        loop. Labels fall back to the seeded words and pickers show what they
        can; `reload()` is the way to try again.
      */
      emit({
        ...snapshot,
        loaded: true,
        loading: false,
        error:
          error instanceof ApiError
            ? error.message
            : "Gagal memuat data hewan (jenis, ras, ukuran, bulu).",
      });
    })
    .finally(() => {
      if (mine === generation) inflight = false;
    });
}

/**
 * Drops the cached list — call after creating, editing, retiring, deleting or
 * restoring an option. Mounted consumers refetch at once; the rest on mount.
 */
export function invalidatePetOptions() {
  generation += 1;
  inflight = false;

  if (listeners.size > 0) {
    snapshot = INITIAL;
    load(true);
  } else {
    emit(INITIAL);
  }
}

function byOrder(a: PetOption, b: PetOption) {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "id");
}

/**
 * The tenant's species, breeds, sizes and coats.
 *
 *   choices(type, keep?) — what a picker offers: ACTIVE options in order, plus
 *                          any code in `keep` the record already holds that is
 *                          retired, deleted or unknown, marked `retired`. Pass
 *                          the stored value as `keep` on an edit form, or the
 *                          select renders a value it has no item for and the
 *                          next save silently clears it.
 *   label(type, code)    — the word for a stored code: the tenant's label, else
 *                          the seeded default, else the code itself. Never
 *                          blank for a non-empty code.
 *   ordered(type)        — every live option of one type (active and retired)
 *                          in order, for a screen laid out per value — the
 *                          commission-per-size rows, a price grid.
 */
export function usePetOptions() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    load();
  }, []);

  const live = useMemo(
    () => state.options.filter((option) => option.deletedAt === null),
    [state.options],
  );

  const ordered = useCallback(
    (type: PetOptionType) =>
      live.filter((option) => option.type === type).sort(byOrder),
    [live],
  );

/*
    BY `_id`, NOT BY CODE (27 September 2026).

    THE BACKEND MOVED ON 25 SEPTEMBER and this layer did not. A pet option has
    no `code` field any more — `pets.species`, `pets.breed`, a service variant's
    `petType` / `sizeCategory` / `furType` all store the option's `_id`, and the
    Joi schemas accept nothing else. Matching on `code` here only appeared to
    work because documents written BEFORE the migration still carry a leftover
    `code` key that `.lean()` passes through untouched; every option created
    since has none, and every stored value has been an id all along.

    THE LEGACY CODE IS STILL TRIED, second. Those residual keys are real data on
    a live database, and a value written as a code before the migration must
    still find its word rather than render as raw text. It costs one miss.
  */
  const label = useCallback(
    (type: PetOptionType, id: string | null | undefined): string | null => {
      if (!id) return null;

      const of = (option: PetOption) =>
        option.type === type && (option._id === id || option.code === id);

      const match = live.find(of) ?? state.options.find(of);

      return match?.label ?? DEFAULT_PET_OPTION_LABELS[type][id] ?? id;
    },
    [live, state.options],
  );

  const choices = useCallback(
    (
      type: PetOptionType,
      keep: Array<string | null | undefined> = [],
    ): PetOptionChoice[] => {
      const active: PetOptionChoice[] = ordered(type)
        .filter((option) => option.isActive)
        .map((option) => ({
          value: option._id,
          label: option.label,
          retired: false,
        }));

      const offered = new Set(active.map((choice) => choice.value));
      const kept = [...new Set(keep)]
        .filter((id): id is string => Boolean(id) && !offered.has(id!))
        .map((id) => ({
          value: id,
          label: `${label(type, id)} (nonaktif)`,
          retired: true,
        }));

      return [...active, ...kept];
    },
    [ordered, label],
  );

  const reload = useCallback(() => load(true), []);

  return {
    /** Live (not deleted) options of every type, active and retired. */
    options: live,
    loading: !state.loaded || state.loading,
    error: state.error,
    choices,
    label,
    ordered,
    reload,
  };
}
