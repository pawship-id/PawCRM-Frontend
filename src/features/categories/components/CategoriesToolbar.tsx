"use client";

import { useState } from "react";
import { ListFilter, Plus } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { CategorySort } from "@/types/api";

import type { CategoriesQuery } from "../hooks/useCategories";

/**
 * The list controls: one row — search, one Filter button, one create button —
 * with the status filter, the deleted toggle and the sort order inside a panel.
 *
 * Purely presentational: it renders the current query and reports changes up.
 *
 * THE SAME SHAPE AS THE CATALOGUE'S, deliberately. These two screens sit one
 * click apart in the nav and are two halves of the same job; a filter that is a
 * row of triggers on one and a button on the other is two things to learn for no
 * reason. It also gives search the whole row on both, which is what narrowing a
 * list of names actually starts with.
 *
 * ONE ARRANGEMENT AT EVERY WIDTH, so there is no `useMediaQuery` here any more.
 * A panel is what a bar collapses into on a phone; once the wide layout is a
 * panel too, the two branches are the same tree and the media query was only
 * choosing between it and itself.
 *
 * TWO AXES, NOT ONE, and keeping them apart is the point of the status field:
 *
 *   Status  — retired or in use. A retired category keeps every product filed
 *             under it; it just stops being offered for new ones.
 *   Dihapus — gone from ordinary reads, restorable by an administrator.
 *
 * They used to be one checkbox, because a category had nowhere to be anything
 * but live or deleted. It does now (`isActive`), and a shop that stops stocking
 * a line wants the first — deleting is refused outright while a live product is
 * still filed under the category.
 *
 * The create button opens a dialog rather than navigating, so `onCreate` is a
 * callback instead of a Link — see CategoryFormDialog for why. FilterBar's
 * `actions` takes a node precisely so both shapes fit without it caring which.
 */
const STATUSES: FilterOption<CategoriesQuery["status"]>[] = [
  { value: "", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

/**
 * The orderings the API accepts — CATEGORY_SORTS in category.model.js.
 *
 * No SKU here, unlike the catalogue's: a category is a name and a date, and
 * those are the only two things there are to order it by.
 */
const SORTS: FilterOption<CategorySort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
];

/** Everything the panel edits, as one draft. */
interface CategoryFilters {
  status: CategoriesQuery["status"];
  includeDeleted: boolean;
  sort: CategorySort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: CategoryFilters = {
  status: "",
  includeDeleted: false,
  sort: "newest",
};

export function CategoriesToolbar({
  query,
  onChange,
  onCreate,
}: {
  query: CategoriesQuery;
  onChange: (patch: Partial<CategoriesQuery>) => void;
  onCreate: () => void;
}) {
  const applied: CategoryFilters = {
    status: query.status,
    includeDeleted: query.includeDeleted,
    sort: query.sort,
  };

  /**
   * Commits the draft, sending only what actually moved.
   *
   * `setQuery` builds a new object out of whatever it is handed and the fetch
   * effect keys on that object's identity, so posting every field back would
   * make Terapkan re-query the list even when nothing changed.
   */
  function apply(next: CategoryFilters) {
    const patch: Partial<CategoriesQuery> = {};
    if (next.status !== query.status) patch.status = next.status;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all three, so the create button takes a
      // line of its own — and takes all of it.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama kategori…"
          ariaLabel="Cari kategori"
          fill
        />
      }
      actions={
        <Can feature="categories" action="create">
          <Button onClick={onCreate} className="w-full">
            <Plus className="size-4" />
            Kategori baru
          </Button>
        </Can>
      }
    >
      <CategoryFilterPanel applied={applied} onApply={apply} />
    </FilterBar>
  );
}

/**
 * The status filter, the deleted toggle and the sort order, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function CategoryFilterPanel({
  applied,
  onApply,
}: {
  applied: CategoryFilters;
  onApply: (next: CategoryFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE ORDERING IS NOT COUNTED. Every list has one, so it is never "on" — a
   * badge reading `Filter (1)` over a screen showing every category would train
   * people to ignore the number, which is the one thing here that must stay
   * worth reading now that the triggers are hidden.
   */
  const count = [applied.status !== "", applied.includeDeleted].filter(
    Boolean,
  ).length;

  function patch(change: Partial<CategoryFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        {/* Sort leads: it is the one field here that is always set, and the
            only one that changes what the top of the list is rather than what
            is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
        />
        <FilterToggle
          label="Tampilkan kategori terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
