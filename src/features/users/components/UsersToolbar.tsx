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
import type { UsersQuery } from "../hooks/useUsers";

/**
 * The list controls: free-text search, a status filter, a "show deleted" toggle,
 * and the entry point to the create screen. Purely presentational: it renders
 * the current query and reports changes up to useUsers via `onChange`.
 *
 * The "all" sentinel this used to carry is gone. It existed because Radix
 * Select forbids an empty item value; FilterSelect renders its own listbox, so
 * `""` is an ordinary option again and the cast back out went with it.
 */
const STATUSES = withAll<UsersQuery["status"]>(
  [
    { value: "active", label: "Aktif" },
    { value: "suspended", label: "Ditangguhkan" },
  ],
  "Semua status",
);

export function UsersToolbar({
  query,
  onChange,
}: {
  query: UsersQuery;
  onChange: (patch: Partial<UsersQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama, email, atau telepon"
          ariaLabel="Cari pengguna"
        />
      }
      actions={
        <Can feature="users" action="create">
          <Button asChild>
            <Link href="/dashboard/master/users/new">
              <Plus className="size-4" />
              Pengguna baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Status"
        ariaLabel="Filter status"
        value={query.status}
        options={STATUSES}
        onChange={(status) => onChange({ status })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
