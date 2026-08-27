"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { useWarehouses } from "../hooks/useWarehouses";
import { useWarehouseBranches } from "../hooks/useWarehouseBranches";
import { WarehousesToolbar } from "./WarehousesToolbar";
import { WarehousesTable } from "./WarehousesTable";

/**
 * The Master Data → Warehouse list screen. Owns the list query (useWarehouses)
 * and the branch lookup (useWarehouseBranches, which the branch column and the
 * branch filter both need), and wires the toolbar, table and pager together. Row
 * mutations call `refetch` so the list reflects the change. Mirrors
 * BranchesScreen.
 *
 * A failed branch lookup is NOT fatal: the warehouse list is still readable
 * without it, so it degrades to an unresolved branch column rather than
 * replacing the screen with an error.
 */
export function WarehousesScreen() {
  const { warehouses, pagination, query, loading, error, setQuery, refetch } =
    useWarehouses();
  const { branches, branchName, error: branchError } = useWarehouseBranches();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Warehouses</h1>
        <p className="mt-1 text-sm text-muted">
          Manage the physical locations stock is held and moved between.
        </p>
      </div>

      <WarehousesToolbar
        query={query}
        branches={branches}
        onChange={setQuery}
      />

      {error && <Alert variant="error">{error}</Alert>}
      {branchError && <Alert variant="info">{branchError}</Alert>}

      {loading && warehouses.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading warehouses…
        </div>
      ) : (
        <>
          <WarehousesTable
            warehouses={warehouses}
            loading={loading}
            onChanged={refetch}
            search={query.search}
            branchName={branchName}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="gudang"
            unitPlural="gudang"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
