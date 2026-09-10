"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Spinner, Pagination } from "@/components";
import { Button } from "@/components/ui/button";
import { CustomerModuleHeader } from "@/features/customers";
import { Can } from "@/features/permissions";

import { usePets } from "../hooks/usePets";
import { PetsToolbar } from "./PetsToolbar";
import { PetsTable } from "./PetsTable";

/**
 * The Hewan tab of the Pelanggan module. Owns the list query (usePets) and wires
 * the toolbar, table and pager together. Row mutations call `refetch` so the list
 * reflects the change.
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

  return (
    <div className="flex flex-col gap-6">
      <CustomerModuleHeader
        action={
          <Can feature="pets" action="create">
            <Button asChild>
              <Link href="/dashboard/master/pets/new">
                <Plus className="size-4" />
                Hewan baru
              </Link>
            </Button>
          </Can>
        }
      />

      <PetsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && pets.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar hewan…
        </div>
      ) : (
        <>
          {/* See CustomersScreen — the order the API returns, stated. */}
          <p className="-mb-2 text-[13px] text-muted">
            Diurutkan dari yang terbaru ditambahkan
          </p>
          <PetsTable
            pets={pets}
            loading={loading}
            onChanged={refetch}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="hewan"
            unitPlural="hewan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
