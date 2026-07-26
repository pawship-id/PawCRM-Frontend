"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HighlightText } from "@/components";
import type { AuditLog } from "@/types/api";

import { AuditActionBadge } from "./AuditActionBadge";

/**
 * Formats an ISO timestamp as a readable local date-time. Falls back to the raw
 * string if the value is unparseable, so a bad record never crashes the row.
 */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** The actor's display name, degrading to a clear label when it is absent. */
function actorName(log: AuditLog): string {
  if (log.userId) return log.userId.fullName;
  return "Unknown user";
}

/**
 * A one-line summary of the record's free-form metadata, so the operator sees
 * WHY without expanding raw JSON. The shape varies by action (see
 * auditLog.service.js) — `reason` for a failed login, `revokedCount` for a
 * logout-all, `lockedUntil` for a lockout — so each known key is rendered on its
 * own terms and anything else is skipped rather than dumped.
 */
function metadataSummary(log: AuditLog): string | null {
  const meta = log.metadata ?? {};
  if (typeof meta.reason === "string") return `Reason: ${meta.reason}`;
  if (typeof meta.revokedCount === "number") {
    return `${meta.revokedCount} session${meta.revokedCount === 1 ? "" : "s"} revoked`;
  }
  if (typeof meta.lockedUntil === "string") {
    return `Locked until ${formatWhen(meta.lockedUntil)}`;
  }
  return null;
}

/**
 * The audit-log list table (shadcn/ui Table) — READ-ONLY.
 *
 * Data flows in via props (from useAuditLogs); there are no row actions because
 * an audit record is immutable — it cannot be edited, deleted or restored. The
 * Actor cell shows the populated user's name and email; the Details cell distils
 * the action's metadata into one line. Mirrors RolesTable's structure minus the
 * Actions column and its lifecycle machinery.
 *
 * `search` is the active search term (the same one the backend filtered on, over
 * action / IP): the matching characters are highlighted in the Action and IP
 * cells so the user sees why each row was returned.
 */
export function AuditLogsTable({
  logs,
  loading,
  search,
}: {
  logs: AuditLog[];
  loading: boolean;
  /** Active search term, highlighted in the searchable cells. */
  search?: string;
}) {
  if (!loading && logs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No audit logs match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table className={loading ? "opacity-60" : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>IP address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const details = metadataSummary(log);
            return (
              <TableRow key={log._id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatWhen(log.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">
                    {actorName(log)}
                  </div>
                  {log.userId?.email && (
                    <div className="text-xs text-muted-foreground">
                      {log.userId.email}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <AuditActionBadge action={log.action} query={search} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {log.entityType}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {details ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {log.ipAddress ? (
                    <HighlightText text={log.ipAddress} query={search} />
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
