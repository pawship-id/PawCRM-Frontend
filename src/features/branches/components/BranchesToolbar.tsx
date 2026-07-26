"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchesQuery } from "../hooks/useBranches";

/**
 * The list controls: free-text search, an active/inactive filter, a "show
 * deleted" toggle, and the entry point to the create screen — all shadcn/ui
 * primitives. Purely presentational: it renders the current query and reports
 * changes up to useBranches via `onChange`. The active filter uses an "all"
 * sentinel because Radix Select forbids an empty item value.
 */
const ALL = "all";
const ACTIVE = "active";
const INACTIVE = "inactive";

export function BranchesToolbar({
  query,
  onChange,
}: {
  query: BranchesQuery;
  onChange: (patch: Partial<BranchesQuery>) => void;
}) {
  const activeValue = query.active === "" ? ALL : query.active ? ACTIVE : INACTIVE;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search name or address"
            aria-label="Search branches"
            className="pl-9"
          />
        </div>

        <Select
          value={activeValue}
          onValueChange={(value) =>
            onChange({
              active: value === ALL ? "" : value === ACTIVE,
            })
          }
        >
          <SelectTrigger aria-label="Filter by state" className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            <SelectItem value={ACTIVE}>Active</SelectItem>
            <SelectItem value={INACTIVE}>Inactive</SelectItem>
          </SelectContent>
        </Select>

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
        <Link href="/dashboard/master/branches/new">
          <Plus className="size-4" />
          New branch
        </Link>
      </Button>
    </div>
  );
}
