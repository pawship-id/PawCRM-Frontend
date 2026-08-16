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
import type { CustomersQuery } from "../hooks/useCustomers";

/**
 * The list controls: free-text search, a VIP-tier filter, a "show deleted"
 * toggle, and the entry point to the create screen. Purely presentational: it
 * renders the current query and reports changes up to useCustomers via
 * `onChange`. Mirrors BranchesToolbar.
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

export function CustomersToolbar({
  query,
  onChange,
}: {
  query: CustomersQuery;
  onChange: (patch: Partial<CustomersQuery>) => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama, email, atau telepon"
          ariaLabel="Cari pelanggan"
        />
      }
      actions={
        <Can feature="customers" action="create">
          <Button asChild>
            <Link href="/dashboard/master/customers/new">
              <Plus className="size-4" />
              Pelanggan baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Tier"
        ariaLabel="Filter tier VIP"
        value={query.vipTier}
        options={TIERS}
        onChange={(vipTier) => onChange({ vipTier })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
