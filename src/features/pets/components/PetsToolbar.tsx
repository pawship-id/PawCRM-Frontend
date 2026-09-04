"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { PetsQuery } from "../hooks/usePets";

/**
 * The list controls: free-text search, species and care filters, a "show
 * deleted" toggle, and the entry point to the create screen. Purely
 * presentational — it renders the current query and reports changes up to
 * usePets via `onChange`. Mirrors CustomersToolbar.
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

export function PetsToolbar({
  query,
  onChange,
}: {
  query: PetsQuery;
  onChange: (patch: Partial<PetsQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau ras"
          ariaLabel="Cari hewan"
        />
      }
      actions={
        <Can feature="pets" action="create">
          <Button asChild>
            <Link href="/dashboard/master/pets/new">
              <Plus className="size-4" />
              Hewan baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Jenis"
        ariaLabel="Filter jenis hewan"
        value={query.species}
        options={SPECIES}
        onChange={(species) => onChange({ species })}
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status perawatan"
        value={query.isActive}
        options={CARE}
        onChange={(isActive) => onChange({ isActive })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
