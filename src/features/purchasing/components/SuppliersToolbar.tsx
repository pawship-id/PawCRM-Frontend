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
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { SupplierSort, SupplierType } from "@/types/api";

import type {
  SupplierActivityFilter,
  SuppliersQuery,
} from "../hooks/useSuppliers";

/**
 * The supplier list controls: one row — search, one Filter button, one create
 * button — with the sort order, the cooperation model, the activity filter and
 * "show deleted" inside the panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useSuppliers.
 *
 * ONE BUTTON RATHER THAN A ROW OF TRIGGERS, at every width, which is the
 * arrangement Produk & Varian uses and the reason the two screens now read the
 * same. Rule §8 hands a quick bar to a screen of four-or-fewer single-selects,
 * and with the ordering this screen has four — the threshold, and one the
 * viewport settles anyway: the bar only ever fit on a wide screen. Below `sm`
 * the triggers wrapped onto two or three lines of their own and pushed the table
 * off the fold, and the collapse the rule prescribes there would have meant a
 * second tree to keep in step with the first. One panel at every width is one
 * tree, and the fields inside it wait for Terapkan like any other panel's.
 *
 * ACTIVITY AND DELETED ARE SEPARATE CONTROLS, and that is the whole reason this
 * panel has three fields. They are different questions — "do we still buy from
 * them" versus "was the record removed" — and a supplier can be either, both or
 * neither. One combined control would have to invent an order between them and
 * would leave one of the four combinations unreachable.
 *
 * THE PRICE IS THAT NOTHING IS VISIBLE AT A GLANCE. A quick bar shows its
 * current values on its triggers; a panel hides them behind a button, and a
 * hidden filter is one people forget is on and then read the wrong numbers from
 * — a supplier list quietly narrowed to "hanya aktif" is one somebody concludes
 * a vendor is gone from. The count on the trigger (`Filter (2)`) is what pays
 * that back.
 *
 * THE ORDERINGS ARE THE ONES THE API NAMES, no more — `SUPPLIER_SORTS` in the
 * model. §8 is explicit about it: a picker offering a column with no index
 * behind it is a control that quietly does something else. That rules out the
 * two a reader of this screen might expect, termin and sisa utang, and the model
 * says why.
 */
const TYPES = withAll<SupplierType | "">(
  [
    { value: "beli_putus", label: "Beli putus" },
    { value: "konsinyasi", label: "Konsinyasi" },
    { value: "both", label: "Keduanya" },
  ],
  "Semua tipe",
);

/**
 * The two unset conventions, side by side: `type` uses the `""` default, while
 * `activity` has "all" as a genuine domain value the API understands, so the
 * field says so with `unsetValue`.
 */
const ACTIVITIES: FilterOption<SupplierActivityFilter>[] = [
  { value: "all", label: "Aktif & nonaktif" },
  { value: "active", label: "Hanya aktif" },
  { value: "inactive", label: "Hanya nonaktif" },
];

/** The orderings the API accepts — SUPPLIER_SORTS in supplier.model.js. */
const SORTS: FilterOption<SupplierSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
];

/** Everything the panel edits, as one draft. */
interface SupplierFilters {
  type: SuppliersQuery["type"];
  activity: SupplierActivityFilter;
  includeDeleted: boolean;
  sort: SupplierSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: SupplierFilters = {
  type: "",
  activity: "all",
  includeDeleted: false,
  sort: "newest",
};

export function SuppliersToolbar({
  query,
  onChange,
}: {
  query: SuppliersQuery;
  onChange: (patch: Partial<SuppliersQuery>) => void;
}) {
  const applied: SupplierFilters = {
    type: query.type,
    activity: query.activity,
    includeDeleted: query.includeDeleted,
    sort: query.sort,
  };

  /**
   * Commits the draft — only what actually moved. `setQuery` builds a new object
   * out of whatever it is passed and the fetch effect keys on it, so posting all
   * four back would re-query the list after pressing Terapkan on an unchanged
   * panel.
   */
  function apply(next: SupplierFilters) {
    const patch: Partial<SuppliersQuery> = {};
    if (next.type !== query.type) patch.type = next.type;
    if (next.activity !== query.activity) patch.activity = next.activity;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the triggers
      // collapsed there is nothing else on the line that grows, and what people
      // type here is vendor names.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all three, so the create button takes a
      // line of its own — and takes all of it. A button hugging its label at one
      // end of an otherwise empty row reads as something left behind.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names exactly the four fields the API searches — a placeholder
          // promising a field the server does not match is a bug report
          // waiting to be filed.
          placeholder="Cari nama, PIC, telepon, atau NPWP…"
          ariaLabel="Cari supplier"
          fill
        />
      }
      actions={
        <Can feature="suppliers" action="create">
          <Button asChild className="w-full">
            <Link href="/dashboard/purchasing/suppliers/new">
              <Plus className="size-4" />
              Supplier baru
            </Link>
          </Button>
        </Can>
      }
    >
      <SupplierFilterPanel applied={applied} onApply={apply} />
    </FilterBar>
  );
}

/**
 * The three filters and the ordering, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function SupplierFilterPanel({
  applied,
  onApply,
}: {
  applied: SupplierFilters;
  onApply: (next: SupplierFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE ORDERING IS NOT COUNTED, on the same grounds the catalogue's panel does
   * not count its own: every list has one, so it is never "on". Nor is "Aktif &
   * nonaktif", which is the activity field's unset value and narrows nothing. A
   * badge that read `Filter (1)` over an unnarrowed list would train people to
   * ignore the number, which is the one thing here that must stay worth reading.
   */
  const count = [
    applied.type !== "",
    applied.activity !== "all",
    applied.includeDeleted,
  ].filter(Boolean).length;

  function patch(change: Partial<SupplierFilters>) {
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
          label="Tipe"
          ariaLabel="Filter tipe kerja sama"
          value={draft.type}
          options={TYPES}
          onChange={(type) => patch({ type })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status aktif"
          value={draft.activity}
          options={ACTIVITIES}
          unsetValue="all"
          onChange={(activity) => patch({ activity })}
        />
        <FilterToggle
          label="Tampilkan supplier terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
