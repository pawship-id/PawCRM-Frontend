"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { SupplierType } from "@/types/api";

import type {
  SupplierActivityFilter,
  SuppliersQuery,
} from "../hooks/useSuppliers";

/**
 * The supplier list controls: free-text search, the cooperation-model filter,
 * the activity filter, a "show deleted" toggle, and the way to the create
 * screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useSuppliers. Mirrors CustomersToolbar.
 *
 * ACTIVITY AND DELETED ARE SEPARATE CONTROLS, and that is the whole reason this
 * toolbar has four. They are different questions — "do we still buy from them"
 * versus "was the record removed" — and a supplier can be either, both or
 * neither. One combined control would have to invent an order between them and
 * would leave one of the four combinations unreachable.
 *
 * The two selects show the two unset conventions side by side: `type` uses the
 * `""` default, while `activity` has "all" as a genuine domain value the API
 * understands, so it says so with `unsetValue`.
 */
const TYPES = withAll<SupplierType | "">(
  [
    { value: "beli_putus", label: "Beli putus" },
    { value: "konsinyasi", label: "Konsinyasi" },
    { value: "both", label: "Keduanya" },
  ],
  "Semua tipe",
);

const ACTIVITIES: FilterOption<SupplierActivityFilter>[] = [
  { value: "all", label: "Aktif & nonaktif" },
  { value: "active", label: "Hanya aktif" },
  { value: "inactive", label: "Hanya nonaktif" },
];

export function SuppliersToolbar({
  query,
  onChange,
}: {
  query: SuppliersQuery;
  onChange: (patch: Partial<SuppliersQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names exactly the four fields the API searches — a placeholder
          // promising a field the server does not match is a bug report
          // waiting to be filed.
          placeholder="Cari nama, PIC, telepon, atau NPWP"
          ariaLabel="Cari supplier"
        />
      }
      actions={
        <Can feature="suppliers" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/suppliers/new">
              <Plus className="size-4" />
              Supplier baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Tipe"
        ariaLabel="Filter tipe kerja sama"
        value={query.type}
        options={TYPES}
        onChange={(type) => onChange({ type })}
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status aktif"
        value={query.activity}
        options={ACTIVITIES}
        unsetValue="all"
        onChange={(activity) => onChange({ activity })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
