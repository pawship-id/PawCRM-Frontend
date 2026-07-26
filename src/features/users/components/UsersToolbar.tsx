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
import type { UsersQuery } from "../hooks/useUsers";

/**
 * The list controls: free-text search, a status filter, a "show deleted" toggle,
 * and the entry point to the create screen — all shadcn/ui primitives. Purely
 * presentational: it renders the current query and reports changes up to
 * useUsers via `onChange`. The status filter uses an "all" sentinel because
 * Radix Select forbids an empty item value.
 */
const ALL = "all";

export function UsersToolbar({
  query,
  onChange,
}: {
  query: UsersQuery;
  onChange: (patch: Partial<UsersQuery>) => void;
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
            placeholder="Search name, email or phone"
            aria-label="Search users"
            className="pl-9"
          />
        </div>

        <Select
          value={query.status || ALL}
          onValueChange={(value) =>
            onChange({
              status: value === ALL ? "" : (value as UsersQuery["status"]),
            })
          }
        >
          <SelectTrigger aria-label="Filter by status" className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
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
        <Link href="/dashboard/master/users/new">
          <Plus className="size-4" />
          New user
        </Link>
      </Button>
    </div>
  );
}
