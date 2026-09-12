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

import type { PetsQuery } from "../hooks/usePets";

/**
 * The list controls: one row — search, and one Filter button — with the species,
 * the care state and the deleted toggle inside a panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePets via `onChange`. Mirrors CustomersToolbar, which is the point: the two
 * are tabs of one module now, and a filter that is a row of triggers on one tab
 * and a button on the other is two things to learn for no reason.
 *
 * The species are spelled out rather than mapped from the `PetSpecies` union
 * with a capitalize class: the label is copy, and copy that happens to match the
 * API's value is a coincidence, not a rule.
 */
const SPECIES = withAll<PetsQuery["species"]>(
  [
    { value: "cat", label: "Kucing" },
    { value: "dog", label: "Anjing" },
  ],
  "Semua jenis",
);

/**
 * Care state as a three-way filter, not a toggle.
 *
 * "Tidak aktif" has to be reachable on its own — that is how somebody finds the
 * pet they retired last week to check whether they meant to. A two-state toggle
 * could only offer "in care" or "everything", which hides the smaller and more
 * interesting set behind a scan of the larger one.
 */
const CARE = withAll<PetsQuery["isActive"]>(
  [
    { value: "true", label: "Masih dirawat" },
    { value: "false", label: "Tidak aktif" },
  ],
  "Semua status",
);

/** Everything the panel edits, as one draft. */
interface PetFilters {
  species: PetsQuery["species"];
  isActive: PetsQuery["isActive"];
  includeDeleted: boolean;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: PetFilters = {
  species: "",
  isActive: "",
  includeDeleted: false,
};

export function PetsToolbar({
  query,
  onChange,
}: {
  query: PetsQuery;
  onChange: (patch: Partial<PetsQuery>) => void;
}) {
  const applied: PetFilters = {
    species: query.species,
    isActive: query.isActive,
    includeDeleted: query.includeDeleted,
  };

  /** Commits the draft, sending only what moved — see CustomersToolbar. */
  function apply(next: PetFilters) {
    const patch: Partial<PetsQuery> = {};
    if (next.species !== query.species) patch.species = next.species;
    if (next.isActive !== query.isActive) patch.isActive = next.isActive;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau ras…"
          ariaLabel="Cari hewan"
          fill
        />
      }
    >
      <PetFilterPanel applied={applied} onApply={apply} />
    </FilterBar>
  );
}

/**
 * The species, the care state and the deleted toggle, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once.
 */
function PetFilterPanel({
  applied,
  onApply,
}: {
  applied: PetFilters;
  onApply: (next: PetFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = [
    applied.species !== "",
    applied.isActive !== "",
    applied.includeDeleted,
  ].filter(Boolean).length;

  function patch(change: Partial<PetFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

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
          label="Jenis"
          ariaLabel="Filter jenis hewan"
          value={draft.species}
          options={SPECIES}
          onChange={(species) => patch({ species })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status perawatan"
          value={draft.isActive}
          options={CARE}
          onChange={(isActive) => patch({ isActive })}
        />
        <FilterToggle
          label="Tampilkan hewan terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
