"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import type { PetOption, PetOptionType } from "@/types/api";



/** One entry a select can render. */
export interface PetOptionChoice {
  /**
   * What gets saved — the option's `_id` for a PET field, its `code` for a
   * service variant's axis. `choices(type, keep, { by })` picks which, and the
   * default stays `code` because the price grid is the older caller.
   */
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
 * ─── A STORED VALUE IS AN ID OR A CODE, DEPENDING ON WHO STORED IT ──────────
 *
 * Since 25 September 2026 a PET holds an option's `_id` (`pet.species`), while
 * a SERVICE VARIANT still holds its `code` (`variant.sizeCategory`), and so do
 * the frozen facts on a booking, an invoice line and a commission row. Only the
 * pet moved.
 *
 * `label`, `code` and `find` therefore accept EITHER and resolve both, so a
 * caller does not have to know which side of that line its value came from —
 * and so a screen reading a pet and a variant side by side needs one helper
 * rather than two. `choices` is the exception: it decides what a form will
 * SAVE, which is a real choice, so it is passed explicitly.
 *
 *   choices(type, keep?, { by }) — what a picker offers: ACTIVE options in
 *                          order, plus anything in `keep` the record already
 *                          holds that is retired, deleted or unknown, marked
 *                          `retired`. Pass the stored value as `keep` on an
 *                          edit form, or the select renders a value it has no
 *                          item for and the next save silently clears it.
 *                          Values are always the option's `_id`.
 *   label(type, value)   — the tenant's word for a stored id, or null when
 *                          nothing matches: a raw id is not a word, and there
 *                          is no seeded table to fall back to.
 *   find(type, value)    — the whole option, for anything the two above do
 *                          not cover.
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

  /**
   * The option behind a stored value — matched on `_id` FIRST, then on `code`.
   *
   * IN THAT ORDER because an id is unambiguous and a code is only unique within
   * BY `_id` ALONE since 25 September 2026 — an option has no code to be found
   * by any more, and every stored value in the app is an id.
   *
   * Live options win, then soft-deleted ones: a pet may point at a word the
   * shop removed, and naming it beats showing an id.
   */
  const find = useCallback(
    (type: PetOptionType, value: string | null | undefined) => {
      if (!value) return null;

      const matches = (option: PetOption) =>
        option.type === type && option._id === value;

      return live.find(matches) ?? state.options.find(matches) ?? null;
    },
    [live, state.options],
  );

  const label = useCallback(
    (type: PetOptionType, value: string | null | undefined): string | null => {
      if (!value) return null;

      const match = find(type, value);
      if (match) return match.label;

      /*
        NOT FOUND — and since 25 September 2026 there is nothing to fall back
        to. A stored value is an option `_id`, generated per tenant, so no table
        of seeded words can name one; printing the raw id would put `66f1a2…` in
        a column of animal names. Callers render the value's own placeholder
        instead, which is why this returns null rather than the id.
      */
      return null;
    },
    [find],
  );

  const choices = useCallback(
    (
      type: PetOptionType,
      keep: Array<string | null | undefined> = [],
    ): PetOptionChoice[] => {
      /*
        ALWAYS THE `_id` since 25 September 2026. There used to be a `by` option
        — `"id"` for a pet field, `"code"` for a variant axis — and both ends
        hold ids now, so the choice had one answer left.
      */
      const valueOf = (option: PetOption) => option._id;

      const active: PetOptionChoice[] = ordered(type)
        .filter((option) => option.isActive)
        .map((option) => ({
          value: valueOf(option),
          label: option.label,
          retired: false,
        }));

      const offered = new Set(active.map((choice) => choice.value));
      /*
        A KEPT VALUE IS RESOLVED BEFORE IT IS COMPARED. An edit form passes the
        stored id; if the option is active it is already in `active` under that
        same id and must not be added twice.
      */
      const kept = [...new Set(keep)]
        .map((stored) => {
          if (!stored) return null;
          const match = find(type, stored);
          return match ? valueOf(match) : stored;
        })
        .filter(
          (value, index, all): value is string =>
            Boolean(value) &&
            !offered.has(value!) &&
            all.indexOf(value) === index,
        )
        .map((value) => ({
          value,
          label: `${label(type, value) ?? value} (nonaktif)`,
          retired: true,
        }));

      return [...active, ...kept];
    },
    [ordered, label, find],
  );

  const reload = useCallback(() => load(true), []);

  return {
    /** Live (not deleted) options of every type, active and retired. */
    options: live,
    loading: !state.loaded || state.loading,
    error: state.error,
    choices,
    label,
    find,
    ordered,
    reload,
  };
}
