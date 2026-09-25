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

/**
 * Looks like an option's `_id` rather than its code.
 *
 * ONLY FOR THE FALLBACK. `label()` prints a value it cannot find, so a shop
 * whose list has not loaded still reads "long hair" rather than a blank — but
 * a raw `66f1a2…` on screen is noise nobody can act on, so an unresolvable id
 * reads as nothing at all.
 */
const looksLikeId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value);

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
 *                          `by: "id"` for a pet field, the default `"code"`
 *                          for a variant axis.
 *   label(type, value)   — the word for a stored id or code: the tenant's
 *                          label, else the seeded default, else the code
 *                          itself. Never blank for a code; null for an id
 *                          nothing matches, because a raw id is not a word.
 *   code(type, value)    — the CODE behind a stored value, for the handful of
 *                          places that key on a seeded one (the cat icon).
 *   find(type, value)    — the whole option, for anything the three above do
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
   * its list; a value that is both (it cannot be — an id is 24 hex characters
   * and a code is a slug) would still resolve to the row that owns the id.
   *
   * Live options win, then soft-deleted ones: a pet may point at a word the
   * shop removed, and naming it beats showing an id.
   */
  const find = useCallback(
    (type: PetOptionType, value: string | null | undefined) => {
      if (!value) return null;

      const matches = (option: PetOption) =>
        option.type === type && (option._id === value || option.code === value);

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
        NOT FOUND. A code still reads as something — the seeded word, else the
        code itself, which is how this behaved before ids existed and what keeps
        a cold cache legible. An id reads as nothing: see `looksLikeId`.
      */
      if (looksLikeId(value)) return null;

      return DEFAULT_PET_OPTION_LABELS[type][value] ?? value;
    },
    [find],
  );

  /**
   * The CODE behind a stored value.
   *
   * FOR THE FEW PLACES THAT KEY ON A SEEDED CODE rather than show a word — the
   * cat-versus-dog icon on the booking detail, which is `cat` or everything
   * else. A pet stores an id now, so those cannot compare the field directly
   * any more, and resolving here beats each of them holding the list.
   */
  const code = useCallback(
    (type: PetOptionType, value: string | null | undefined): string | null =>
      find(type, value)?.code ?? null,
    [find],
  );

  const choices = useCallback(
    (
      type: PetOptionType,
      keep: Array<string | null | undefined> = [],
      { by = "code" }: { by?: "code" | "id" } = {},
    ): PetOptionChoice[] => {
      const valueOf = (option: PetOption) =>
        by === "id" ? option._id : option.code;

      const active: PetOptionChoice[] = ordered(type)
        .filter((option) => option.isActive)
        .map((option) => ({
          value: valueOf(option),
          label: option.label,
          retired: false,
        }));

      const offered = new Set(active.map((choice) => choice.value));
      /*
        A KEPT VALUE IS RE-EXPRESSED IN `by`'s terms before it is compared. An
        edit form opened on a pet passes the stored id; if the option is active
        it is already in `active` under that same id and must not be added
        twice — but a caller that passed a code into an id-keyed picker would
        otherwise get a duplicate row that saves the wrong thing.
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
    code,
    find,
    ordered,
    reload,
  };
}
