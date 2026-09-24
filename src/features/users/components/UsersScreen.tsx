"use client";

import { useMemo } from "react";

import { Alert, Spinner, Pagination } from "@/components";
import { SettingsPageHeader } from "@/features/settings/components/SettingsHeader";

import { useUsers } from "../hooks/useUsers";
import { useLookups } from "../hooks/useLookups";
import { UsersToolbar } from "./UsersToolbar";
import { UsersTable } from "./UsersTable";

/**
 * Pengaturan › Pengguna, the user list screen. Owns the list query (useUsers) and the
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
      <SettingsPageHeader
        tab="sistem"
        title="Pengguna"
        description="Staf, perannya, dan status akunnya. Peran menentukan fitur yang boleh dibuka; akses cabang menentukan data yang terlihat."
      />

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
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="user"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
