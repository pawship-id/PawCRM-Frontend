"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  triState,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { BranchesQuery } from "../hooks/useBranches";

/**
 * The list controls: free-text search, an active/inactive filter, a "show
 * deleted" toggle, and the entry point to the create screen. Purely
 * presentational: it renders the current query and reports changes up to
 * useBranches via `onChange`.
 *
 * `active` is `boolean | ""`, which used to mean a three-way sentinel dance —
 * "all"/"active"/"inactive" strings on the way in, a ternary back to booleans on
 * the way out. `triState()` carries the real values, so `onChange({ active })`
 * type-checks with nothing in between.
 */
const STATES = triState({
  all: "Semua status",
  yes: "Aktif",
  no: "Nonaktif",
});

export function BranchesToolbar({
  query,
  onChange,
}: {
  query: BranchesQuery;
  onChange: (patch: Partial<BranchesQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau alamat"
          ariaLabel="Cari cabang"
        />
      }
      actions={
        <Can feature="branches" action="create">
          <Button asChild>
            <Link href="/dashboard/master/branches/new">
              <Plus className="size-4" />
              Cabang baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Status"
        ariaLabel="Filter status"
        value={query.active}
        options={STATES}
        onChange={(active) => onChange({ active })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
