"use client";

import { Alert, Spinner, Pagination } from "@/components";
import { SettingsPageHeader } from "@/features/settings/components/SettingsHeader";

import { useAuditLogs } from "../hooks/useAuditLogs";
import { AuditLogsToolbar } from "./AuditLogsToolbar";
import { AuditLogsTable } from "./AuditLogsTable";

/**
 * Pengaturan › Riwayat perubahan, the audit log screen. Owns the list query (useAuditLogs) and
 * wires the toolbar, table and pager together. Read-only: there are no row
 * mutations, so the toolbar's Refresh is the only thing that calls `refetch`.
 * Mirrors RolesScreen.
 */
export function AuditLogsScreen() {
  const { logs, pagination, query, loading, error, setQuery, refetch } =
    useAuditLogs();

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="sistem"
        title="Riwayat perubahan"
        description="Siapa melakukan apa, dari mana, dan kapan. Sistem yang menulis catatan ini, jadi hanya bisa dibaca."
      />

      <AuditLogsToolbar query={query} onChange={setQuery} onRefresh={refetch} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Loading audit logs…
        </div>
      ) : (
        <>
          <AuditLogsTable logs={logs} loading={loading} search={query.search} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="event"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
