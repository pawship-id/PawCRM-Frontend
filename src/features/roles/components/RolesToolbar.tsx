"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { RolesQuery } from "../hooks/useRoles";

/**
 * The role list controls: free-text search, a "show deleted" toggle, and the
 * entry point to the create screen. Purely presentational — renders the current
 * query and reports changes up to useRoles via `onChange`. Mirrors UsersToolbar,
 * minus the status filter (roles have no active/suspended axis).
 */
export function RolesToolbar({
  query,
  onChange,
}: {
  query: RolesQuery;
  onChange: (patch: Partial<RolesQuery>) => void;
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
            placeholder="Search name or description"
            aria-label="Search roles"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-deleted"
            checked={query.includeDeleted}
            onCheckedChange={(checked) =>
              onChange({ includeDeleted: checked === true })
            }
          />
          <Label htmlFor="show-deleted" className="font-normal">
            Show deleted
          </Label>
        </div>
      </div>

      <Button asChild>
        <Link href="/dashboard/master/roles/new">
          <Plus className="size-4" />
          New role
        </Link>
      </Button>
    </div>
  );
}
