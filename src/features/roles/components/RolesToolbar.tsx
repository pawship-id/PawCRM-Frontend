"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { FilterBar, FilterSearch, FilterToggle } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { RolesQuery } from "../hooks/useRoles";

/**
 * The role list controls: free-text search, a "show deleted" toggle, and the
 * entry point to the create screen. Purely presentational — renders the current
 * query and reports changes up to useRoles via `onChange`. Mirrors UsersToolbar,
 * minus the status filter (roles have no active/suspended axis).
 */
export function RolesToolbar({
  query,
  onChange,
}: {
  query: RolesQuery;
  onChange: (patch: Partial<RolesQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau deskripsi"
          ariaLabel="Cari peran"
        />
      }
      actions={
        <Can feature="roles" action="create">
          <Button asChild>
            <Link href="/dashboard/master/roles/new">
              <Plus className="size-4" />
              Peran baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
