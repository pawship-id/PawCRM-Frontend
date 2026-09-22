"use client";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  triState,
} from "@/components";
import type { BranchesQuery } from "../hooks/useBranches";

/**
 * The list controls: free-text search, an active/inactive filter and a "show
 * deleted" toggle. NO CREATE BUTTON since 22 September 2026: a branch is its own
 * subscription and the Buloo team switches it on (mockup `buloo-navigation-v3`). Purely
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
