import { apiClient } from "./api-client";
import type { AuditLog, AuditLogListQuery, PageResult } from "@/types/api";

/**
 * Audit-log domain calls against /api/audit-logs.
 *
 * The trail is READ-ONLY (see auditLog.model.js), so this service exposes a
 * single operation — the filtered list. There is no create/update/delete: audit
 * records are appended by the backend on sensitive events, never by a client.
 *
 * Like every other service here, each call maps one typed domain operation onto
 * one apiClient request — no React, no state. The tenant scope is derived from
 * the session cookie by the backend, so it is never passed. Access is gated by
 * the `auditLogs:read` permission, enforced server-side.
 */
export const auditLogService = {
  /**
   * GET /audit-logs — paginated, filterable, newest-first trail.
   *
   * Spread into a fresh object literal so it satisfies apiClient's query type;
   * apiClient drops the undefined entries when building the query string.
   */
  list: (query: AuditLogListQuery = {}) =>
    apiClient.get<PageResult<AuditLog>>("/audit-logs", {
      query: {
        page: query.page,
        limit: query.limit,
        action: query.action,
        entityType: query.entityType,
        userId: query.userId,
        search: query.search,
      },
    }),
};
