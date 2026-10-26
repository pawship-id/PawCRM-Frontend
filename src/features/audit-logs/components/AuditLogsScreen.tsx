"use client";

import { Alert, Pagination } from "@/components";
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
        description="Siapa mengubah faktur, pembayaran, kas, dan stok — dan kapan. Sistem yang menulis catatan ini, jadi hanya bisa dibaca."
      />

      <AuditLogsToolbar query={query} onChange={setQuery} onRefresh={refetch} />

      {error && <Alert variant="error">{error}</Alert>}

      <AuditLogsTable logs={logs} loading={loading} search={query.search} />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        unit="aktivitas"
        onPageChange={(page) => setQuery({ page })}
      />
    </div>
  );
}
