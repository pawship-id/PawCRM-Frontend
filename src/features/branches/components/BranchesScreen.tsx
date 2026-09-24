"use client";

import { Alert, Spinner, Pagination } from "@/components";
import { SettingsPageHeader } from "@/features/settings/components/SettingsHeader";

import { useBranches } from "../hooks/useBranches";
import { BranchesToolbar } from "./BranchesToolbar";
import { BranchesTable } from "./BranchesTable";

/**
 * Pengaturan › Cabang, the branch list screen. Owns the list query (useBranches) and
 * wires the toolbar, table and pager together. Row mutations call `refetch` so
 * the list reflects the change. Mirrors UsersScreen.
 */
export function BranchesScreen() {
  const { branches, pagination, query, loading, error, setQuery, refetch } =
    useBranches();

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="umum"
        title="Cabang"
        description="Alamat dan telepon yang tercetak di struk. Cabang baru diaktifkan oleh tim Buloo — tiap cabang punya langganan sendiri."
      />

      <BranchesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && branches.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading branches…
        </div>
      ) : (
        <>
          <BranchesTable
            branches={branches}
            loading={loading}
            onChanged={refetch}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="cabang"
            unitPlural="cabang"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
