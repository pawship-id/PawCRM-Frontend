"use client";

import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditLogsQuery } from "../hooks/useAuditLogs";
import { AUDIT_ACTION_OPTIONS } from "../constants";

/**
 * The audit-log list controls: free-text search (ip / action), an action filter,
 * and a manual refresh. Purely presentational — renders the current query and
 * reports changes up to useAuditLogs via `onChange`. Mirrors the master-data
 * toolbars, but with NO "New" button: the trail is read-only.
 *
 * The action filter uses an "all" sentinel because Radix Select forbids an empty
 * item value — the same shape UsersToolbar's status filter uses.
 */
const ALL = "all";

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search action or IP address"
            aria-label="Search audit logs"
            className="pl-9"
          />
        </div>

        <Select
          value={query.action || ALL}
          onValueChange={(value) =>
            onChange({ action: value === ALL ? "" : value })
          }
        >
          <SelectTrigger aria-label="Filter by action" className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actions</SelectItem>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" onClick={onRefresh}>
        <RotateCcw className="size-4" />
        Refresh
      </Button>
    </div>
  );
}
