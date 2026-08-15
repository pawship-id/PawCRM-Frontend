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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Can } from "@/features/permissions";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import type { CategoriesQuery } from "../hooks/useCategories";

/**
 * The list controls: a status filter, the deleted toggle behind "Filter lain",
 * free-text search, and the create button.
 *
 * Purely presentational — it renders the current query and reports changes up.
 *
 * TWO AXES, NOT ONE, and keeping them apart is the whole design of this bar:
 *
 *   Status  — retired or in use. A retired category keeps every product filed
 *             under it; it just stops being offered for new ones.
 *   Dihapus — gone from ordinary reads, restorable by an administrator.
 *
 * They used to be one checkbox, because a category had nowhere to be anything
 * but live or deleted. It does now (`isActive`), and a shop that stops stocking
 * a line wants the first, not the second — deleting is refused outright while a
 * live product is still filed under the category.
 *
 * DELETED SITS BEHIND "Filter lain" while status is on the bar, mirroring the
 * catalogue. Retiring and reinstating is ordinary weekly housekeeping; digging
 * through deleted categories is something somebody does twice a year, and a bar
 * that gives both the same prominence is a bar that has not chosen.
 *
 * BELOW 600px BOTH TRIGGERS COLLAPSE into a single `Filter` button opening a
 * FilterPanel, exactly as the catalogue does. Two triggers do fit on a phone
 * where the catalogue's four do not — but these screens sit one click apart in
 * the nav, and a filter control that is a row of triggers on one and a button on
 * the other is two things to learn for no reason. The branches are alternatives
 * rather than a CSS hide, so there is never a second control carrying the same
 * accessible name in the DOM.
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

/** The width at which the bar stops being one. Matches the catalogue's. */
const BAR_FITS = "(min-width: 600px)";

/** The filters, in the shape the panel edits them as a draft. */
interface CategoryFilters {
  status: CategoriesQuery["status"];
  includeDeleted: boolean;
}

const CLEARED: CategoryFilters = { status: "", includeDeleted: false };

export function CategoriesToolbar({
  query,
  onChange,
  onCreate,
}: {
  query: CategoriesQuery;
  onChange: (patch: Partial<CategoriesQuery>) => void;
  onCreate: () => void;
}) {
  // The wide bar is the fallback: it is what the server prerenders, so a desktop
  // load never starts collapsed. A phone corrects itself on hydration.
  const compact = !useMediaQuery(BAR_FITS, true);

  const applied: CategoryFilters = {
    status: query.status,
    includeDeleted: query.includeDeleted,
  };

  /**
   * Commits a whole draft, sending only what actually moved.
   *
   * `setQuery` builds a new object out of whatever it is handed and the fetch
   * effect keys on that object's identity, so posting both fields back would
   * make Terapkan re-query the list even when nothing changed.
   */
  function apply(next: CategoryFilters) {
    const patch: Partial<CategoriesQuery> = {};
    if (next.status !== query.status) patch.status = next.status;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      /*
        SEARCH LEADS THE ROW, ahead of the filters. Narrowing a category list
        almost always starts by typing a name — there are two filters and
        hundreds of names — so the reading order matches the order people work
        in. The create button stays pinned at the far end, the one control here
        that is not about narrowing anything.

        NARROW: the same row, wrapping. Search takes the whole first line, so
        the `Filter` button and the create button fall onto the second together.
      */
      searchPlacement="leading"
      searchClassName={compact ? "w-full" : undefined}
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama kategori…"
          ariaLabel="Cari kategori"
          // Back to the shared width now that it shares the line with the
          // filters: the wider box was for a row it had to itself.
          className={compact ? "max-w-none" : undefined}
        />
      }
      actions={
        <Can feature="categories" action="create">
          {/* Sized to its label in both layouts: on a phone it shares the line
              with the `Filter` button, and the two nearly fill it. */}
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            Kategori baru
          </Button>
        </Can>
      }
    >
      {compact ? (
        <CompactFilters applied={applied} onApply={apply} />
      ) : (
        <>
          <FilterSelect
            label="Status"
            ariaLabel="Filter status"
            value={query.status}
            options={STATUSES}
            onChange={(status) => onChange({ status })}
          />
          <MoreFilters
            includeDeleted={query.includeDeleted}
            onApply={(includeDeleted) => onChange({ includeDeleted })}
          />
        </>
      )}
    </FilterBar>
  );
}

/**
 * Both filters as one button, for a screen too narrow to lay them out.
 *
 * Status auto-applies on the wide bar and waits for Terapkan here, which is the
 * rule for a select inside a panel (§8): a panel exists so the list is queried
 * once for a decision somebody made in one sitting.
 */
function CompactFilters({
  applied,
  onApply,
}: {
  applied: CategoryFilters;
  onApply: (next: CategoryFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = [applied.status !== "", applied.includeDeleted].filter(
    Boolean,
  ).length;

  function onOpenChange(next: boolean) {
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
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => setDraft((prev) => ({ ...prev, status }))}
        />
        <FilterToggle
          label="Tampilkan kategori terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) =>
            setDraft((prev) => ({ ...prev, includeDeleted }))
          }
        />
      </FilterPanel>
    </>
  );
}

/**
 * The rare filter — deleted categories — behind one trigger.
 *
 * Its own Reset and Terapkan even though it holds a single field, because that
 * field is not on the bar: a checkbox in a popover that applied on the tick
 * would leave people wondering whether it took, with the list hidden behind the
 * popover they are still standing in. Reset applies at once, as everywhere.
 */
function MoreFilters({
  includeDeleted,
  onApply,
}: {
  includeDeleted: boolean;
  onApply: (includeDeleted: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(includeDeleted);

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
    if (next) setDraft(includeDeleted);
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label="Filter lain"
          active={includeDeleted}
          icon={<ListFilter className="size-4" />}
          aria-label="Filter lain"
        />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-4">
          <FilterToggle
            label="Tampilkan kategori terhapus"
            checked={draft}
            onChange={setDraft}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              onApply(false);
              setOpen(false);
            }}
            className="rounded-sm text-sm font-semibold text-warning outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reset
          </button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
