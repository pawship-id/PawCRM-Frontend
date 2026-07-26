"use client";

import { useMemo } from "react";

import { Alert, Spinner } from "@/components";

import { useUsers } from "../hooks/useUsers";
import { useLookups } from "../hooks/useLookups";
import { UsersToolbar } from "./UsersToolbar";
import { UsersTable } from "./UsersTable";
import { Pagination } from "./Pagination";

/**
 * The Master Data → User list screen. Owns the list query (useUsers) and the
 * role lookup used to label the Role column, and wires the toolbar, table and
 * pager together. Row mutations call `refetch` so the list reflects the change.
 */
export function UsersScreen() {
  const { users, pagination, query, loading, error, setQuery, refetch } =
    useUsers();
  const { roles } = useLookups();

  const roleNames = useMemo(
    () => Object.fromEntries(roles.map((role) => [role._id, role.name])),
    [roles],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Manage staff accounts, their roles and branch access.
        </p>
      </div>

      <UsersToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading users…
        </div>
      ) : (
        <>
          <UsersTable
            users={users}
            roleNames={roleNames}
            loading={loading}
            onChanged={refetch}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
