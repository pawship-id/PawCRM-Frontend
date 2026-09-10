"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  withAll,
} from "@/components";

import type { CustomersQuery } from "../hooks/useCustomers";

/**
 * The list controls: one row — search, and one Filter button — with the VIP tier
 * and the deleted toggle inside a panel.
 *
 * Purely presentational: it renders the current query and reports changes up to
 * useCustomers via `onChange`.
 *
 * THE SHAPE EVERY OTHER LIST IN THE APP USES. This screen and Hewan were the
 * last two holding their filters out on the row while Produk, Kategori, Supplier
 * and the seven inventory lists had moved behind a button. A reader crossing
 * between them should not have to notice which arrangement each screen picked —
 * and search taking the whole row is what narrowing a list of names starts with.
 *
 * TWO FIELDS, WHICH IS THE FLOOR §8 SETS, not a comfortable margin: one filter
 * behind a button would be a button that hides one thing. The neighbourhood
 * argument is what carries it over the line, the same way it carried Stok Awal
 * and Penyesuaian Stok.
 *
 * NO CREATE BUTTON — it moved up to CustomerModuleHeader when the module grew a
 * tab bar, because the button belongs to the page rather than to the narrowing
 * controls, and each tab creates a different thing.
 *
 * The tiers are spelled out rather than mapped from the `VipTier` union with a
 * capitalize class: the label is copy, and copy that happens to match the API's
 * value is a coincidence, not a rule.
 */
const TIERS = withAll<CustomersQuery["vipTier"]>(
  [
    { value: "bronze", label: "Bronze" },
    { value: "silver", label: "Silver" },
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
  ],
  "Semua tier",
);

/** Everything the panel edits, as one draft. */
interface CustomerFilters {
  vipTier: CustomersQuery["vipTier"];
  includeDeleted: boolean;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: CustomerFilters = { vipTier: "", includeDeleted: false };

export function CustomersToolbar({
  query,
  onChange,
}: {
  query: CustomersQuery;
  onChange: (patch: Partial<CustomersQuery>) => void;
}) {
  const applied: CustomerFilters = {
    vipTier: query.vipTier,
    includeDeleted: query.includeDeleted,
  };

  /**
   * Commits the draft, sending only what actually moved — `setQuery` builds a
   * new object from whatever it is handed and the fetch effect keys on that
   * object's identity, so posting every field back would re-query the list on a
   * Terapkan that changed nothing.
   */
  function apply(next: CustomerFilters) {
    const patch: Partial<CustomersQuery> = {};
    if (next.vipTier !== query.vipTier) patch.vipTier = next.vipTier;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama, email, atau telepon…"
          ariaLabel="Cari pelanggan"
          fill
        />
      }
    >
      <CustomerFilterPanel applied={applied} onApply={apply} />
    </FilterBar>
  );
}

/**
 * The tier filter and the deleted toggle, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function CustomerFilterPanel({
  applied,
  onApply,
}: {
  applied: CustomerFilters;
  onApply: (next: CustomerFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now. The badge is what makes
   * a collapsed bar safe: a hidden filter is one people forget is on and then
   * read the wrong numbers from.
   */
  const count = [applied.vipTier !== "", applied.includeDeleted].filter(
    Boolean,
  ).length;

  function patch(change: Partial<CustomerFilters>) {
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
        <FilterSelect
          layout="field"
          label="Tier"
          ariaLabel="Filter tier VIP"
          value={draft.vipTier}
          options={TIERS}
          onChange={(vipTier) => patch({ vipTier })}
        />
        <FilterToggle
          label="Tampilkan pelanggan terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
