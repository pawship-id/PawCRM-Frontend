"use client";

import { RotateCcw } from "lucide-react";

import { FilterBar, FilterSearch, FilterSelect, withAll } from "@/components";
import { Button } from "@/components/ui/button";
import type { AuditLogsQuery } from "../hooks/useAuditLogs";
import {
  AUDIT_CATEGORIES,
  actionOptions,
  type AuditCategory,
} from "../constants";

/**
 * The audit-log list controls: search by document number, a module filter, an
 * activity filter narrowed to that module, and a manual refresh. Purely
 * presentational — renders the current query and reports changes up to
 * useAuditLogs via `onChange`. NO "New" button: the trail is read-only.
 */
const CATEGORIES = withAll<AuditCategory | "">(
  [...AUDIT_CATEGORIES],
  "Semua modul",
);

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
          placeholder="Cari nomor dokumen"
          ariaLabel="Cari nomor dokumen"
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
        label="Modul"
        value={query.category}
        options={CATEGORIES}
        // An action from another module would leave the two filters
        // contradicting each other, so picking a module clears it.
        onChange={(category) => onChange({ category, action: "" })}
      />
      <FilterSelect
        label="Aktivitas"
        value={query.action}
        options={withAll(actionOptions(query.category), "Semua aktivitas")}
        onChange={(action) => onChange({ action })}
      />
    </FilterBar>
  );
}
