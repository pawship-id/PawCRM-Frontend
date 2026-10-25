"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Pagination } from "@/components";
import { Button } from "@/components/ui/button";
import { CustomerModuleHeader } from "@/features/customers";
import { Can } from "@/features/permissions";

import { usePets } from "../hooks/usePets";
import { PetsToolbar } from "./PetsToolbar";
import { PetsTable } from "./PetsTable";

/**
 * The Hewan tab of the Pelanggan module. Owns the list query (usePets) and wires
 * the toolbar, table and pager together. Row mutations call `handleRowChanged`,
 * which refetches the list AND bumps the header's `refreshKey` — the same fix
 * `CustomersScreen` carries for "Jumlah pelanggan", here for "Jumlah hewan"
 * (2 October 2026, fixing a bug report): `CustomerModuleHeader` counts the
 * register in its own request, with no subscription to this tab's table, so a
 * deleted or restored row used to leave the tile above it stale until a reload.
 *
 * IT WEARS THE CUSTOMER MODULE'S HEADER, which is the whole point of the tab
 * bar: the rail has one row for Pelanggan now, and this route is one of its
 * tabs. Importing from `@/features/customers` rather than copying the header is
 * the same call BookingForm makes for CustomerSearchDialog — the module owns it,
 * and its public surface is where it is borrowed from.
 */
export function PetsScreen() {
  const { pets, pagination, query, loading, error, setQuery, refetch } =
    usePets();

  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const handleRowChanged = useCallback(() => {
    refetch();
    setHeaderRefreshKey((key) => key + 1);
  }, [refetch]);

  return (
    <div className="flex flex-col gap-6">
      <CustomerModuleHeader
        action={
          <Can feature="pets" action="create">
            <Button asChild>
              <Link href="/dashboard/pets/new">
                <Plus className="size-4" />
                Hewan baru
              </Link>
            </Button>
          </Can>
        }
        refreshKey={headerRefreshKey}
      />

      <PetsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {/* The table owns its loading row and its empty row now — it keeps the
          old rows on screen, dimmed, while a re-sort or a page change loads. */}
      <PetsTable
        pets={pets}
        loading={loading}
        onChanged={handleRowChanged}
        search={query.search}
        sort={query.sort}
        onSortChange={(sort) => setQuery({ sort })}
      />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        unit="hewan"
        unitPlural="hewan"
        onPageChange={(page) => setQuery({ page })}
      />
    </div>
  );
}
