"use client";

import { RotateCcw } from "lucide-react";

import { FilterBar, FilterSearch, FilterSelect, withAll } from "@/components";
import { Button } from "@/components/ui/button";
import type { AuditLogsQuery } from "../hooks/useAuditLogs";
import { AUDIT_ACTION_OPTIONS } from "../constants";

/**
 * The audit-log list controls: free-text search (ip / action), an action filter,
 * and a manual refresh. Purely presentational — renders the current query and
 * reports changes up to useAuditLogs via `onChange`. Mirrors the master-data
 * toolbars, but with NO "New" button: the trail is read-only.
 */
const ACTIONS = withAll(AUDIT_ACTION_OPTIONS, "Semua aksi");

export function AuditLogsToolbar({
  query,
  onChange,
  onRefresh,
}: {
  query: AuditLogsQuery;
  onChange: (patch: Partial<AuditLogsQuery>) => void;
  onRefresh: () => void;
}) {
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari aksi atau alamat IP"
          ariaLabel="Cari log audit"
        />
      }
      actions={
        <Button variant="secondary" onClick={onRefresh}>
          <RotateCcw className="size-4" />
          Muat ulang
        </Button>
      }
    >
      <FilterSelect
        label="Aksi"
        ariaLabel="Filter aksi"
        value={query.action}
        options={ACTIONS}
        onChange={(action) => onChange({ action })}
      />
    </FilterBar>
  );
}
