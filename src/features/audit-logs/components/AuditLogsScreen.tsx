"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { useAuditLogs } from "../hooks/useAuditLogs";
import { AuditLogsToolbar } from "./AuditLogsToolbar";
import { AuditLogsTable } from "./AuditLogsTable";

/**
 * The Master Data → Audit Log screen. Owns the list query (useAuditLogs) and
 * wires the toolbar, table and pager together. Read-only: there are no row
 * mutations, so the toolbar's Refresh is the only thing that calls `refetch`.
 * Mirrors RolesScreen.
 */
export function AuditLogsScreen() {
  const { logs, pagination, query, loading, error, setQuery, refetch } =
    useAuditLogs();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Audit Log</h1>
        <p className="mt-1 text-sm text-muted">
          A record of security-sensitive events — who did what, from where, and
          when.
        </p>
      </div>

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
