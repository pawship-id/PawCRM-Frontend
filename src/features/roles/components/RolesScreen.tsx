"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { useRoles } from "../hooks/useRoles";
import { RolesToolbar } from "./RolesToolbar";
import { RolesTable } from "./RolesTable";

/**
 * The Master Data → Roles list screen. Owns the list query (useRoles) and wires
 * the toolbar, table and pager together. Row mutations call `refetch` so the
 * list reflects the change. Mirrors UsersScreen.
 */
export function RolesScreen() {
  const { roles, pagination, query, loading, error, setQuery, refetch } =
    useRoles();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Roles</h1>
        <p className="mt-1 text-sm text-muted">
          Define roles and the permissions attached to them.
        </p>
      </div>

      <RolesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && roles.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading roles…
        </div>
      ) : (
        <>
          <RolesTable roles={roles} loading={loading} onChanged={refetch} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="role"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
