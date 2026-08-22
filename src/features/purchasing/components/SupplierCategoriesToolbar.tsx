"use client";

import { useState } from "react";
import Link from "next/link";
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

import type { SupplierCategoriesQuery } from "../hooks/useSupplierCategories";

/**
 * The list controls: one row — search, one Filter button, one create button —
 * with the status filter, the deleted toggle and the sort order inside a panel.
 *
 * Purely presentational: it renders the current query and reports changes up.
 *
 * ONE PANEL AT EVERY WIDTH, which is what every screen in Purchasing does (§8's
 * module mapping) and what the product Kategori screen does with the same three
 * fields. This is the smallest list in the module and the one most likely to be
 * argued onto a quick bar; it stays with its neighbours, because somebody
 * reading Supplier and then Kategori Supplier in the same sitting should not
 * have to notice that the filters moved.
 *
 * THREE FIELDS, ONE FEWER THAN THE PRODUCT SCREEN'S. There is no Tingkat filter
 * because there is no tree — a supplier category is a flat label, and the API
 * has no `parentId` to narrow on.
 *
 * TWO AXES, NOT ONE, and keeping them apart is the point of the status field:
 *
 *   Status  — retired or in use. A retired category keeps every supplier
 *             already grouped under it; it just stops being offered.
 *   Dihapus — gone from ordinary reads, restorable by an administrator.
 */
const STATUSES: FilterOption<SupplierCategoriesQuery["status"]>[] = [
  { value: "", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

/**
 * The orderings the API accepts — CATEGORY_SORTS in category.model.js, the same
 * closed list product categories use. A supplier category is a name and a date,
 * and those are the only two things there are to order it by.
 */
const SORTS: FilterOption<CategorySort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
];

/** Everything the panel edits, as one draft. */
interface SupplierCategoryFilters {
  status: SupplierCategoriesQuery["status"];
  includeDeleted: boolean;
  sort: CategorySort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: SupplierCategoryFilters = {
  status: "",
  includeDeleted: false,
  sort: "newest",
};

export function SupplierCategoriesToolbar({
  query,
  onChange,
}: {
  query: SupplierCategoriesQuery;
  onChange: (patch: Partial<SupplierCategoriesQuery>) => void;
}) {
  const applied: SupplierCategoryFilters = {
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
  function apply(next: SupplierCategoryFilters) {
    const patch: Partial<SupplierCategoriesQuery> = {};
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
          ariaLabel="Cari kategori supplier"
          fill
        />
      }
      actions={
        <Can feature="supplierCategories" action="create">
          {/* `asChild` so the Link IS the button — nesting an <a> inside a
              <button> is invalid markup and gives a screen reader two controls
              where there is one. */}
          <Button asChild className="w-full">
            <Link href="/dashboard/purchasing/supplier-categories/new">
              <Plus className="size-4" />
              Kategori baru
            </Link>
          </Button>
        </Can>
      }
    >
      <SupplierCategoryFilterPanel applied={applied} onApply={apply} />
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
function SupplierCategoryFilterPanel({
  applied,
  onApply,
}: {
  applied: SupplierCategoryFilters;
  onApply: (next: SupplierCategoryFilters) => void;
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

  function patch(change: Partial<SupplierCategoryFilters>) {
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
