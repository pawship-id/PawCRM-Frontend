"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  namedOptions,
  triState,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { Branch } from "@/types/api";

import type { WarehousesQuery } from "../hooks/useWarehouses";

/**
 * The list controls: free-text search, a branch filter, an active/inactive
 * filter, a "show deleted" toggle, and the entry point to the create screen.
 * Purely presentational: it renders the current query and reports changes up to
 * useWarehouses via `onChange`.
 *
 * The branch filter lists branches only — the backend's `?defaultBranchId=`
 * takes an id, so there is no way to ask it for the central (unassigned)
 * warehouses alone.
 */
const STATES = triState({
  all: "Semua status",
  yes: "Aktif",
  no: "Nonaktif",
});

export function WarehousesToolbar({
  query,
  branches,
  onChange,
}: {
  query: WarehousesQuery;
  /** Branch options for the filter; empty until useWarehouseBranches resolves. */
  branches: Branch[];
  onChange: (patch: Partial<WarehousesQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama, alamat, atau PIC"
          ariaLabel="Cari gudang"
        />
      }
      actions={
        <Can feature="warehouses" action="create">
          <Button asChild>
            <Link href="/dashboard/master/warehouses/new">
              <Plus className="size-4" />
              Gudang baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Cabang"
        ariaLabel="Filter cabang"
        value={query.branchId}
        options={withAll(namedOptions(branches), "Semua cabang")}
        onChange={(branchId) => onChange({ branchId })}
      />
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
