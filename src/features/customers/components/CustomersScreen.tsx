"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { useCustomers } from "../hooks/useCustomers";
import { CustomersToolbar } from "./CustomersToolbar";
import { CustomersTable } from "./CustomersTable";

/**
 * The Master Data → Customer list screen. Owns the list query (useCustomers) and
 * wires the toolbar, table and pager together. Row mutations call `refetch` so
 * the list reflects the change. Mirrors BranchesScreen.
 */
export function CustomersScreen() {
  const { customers, pagination, query, loading, error, setQuery, refetch } =
    useCustomers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Customers</h1>
        <p className="mt-1 text-sm text-muted">
          Manage the people your business serves — their contact details and VIP
          tier.
        </p>
      </div>

      <CustomersToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && customers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading customers…
        </div>
      ) : (
        <>
          <CustomersTable
            customers={customers}
            loading={loading}
            onChanged={refetch}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="pelanggan"
            unitPlural="pelanggan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
