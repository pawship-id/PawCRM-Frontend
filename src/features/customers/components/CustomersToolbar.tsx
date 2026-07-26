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
import { Can } from "@/features/permissions";
import type { VipTier } from "@/types/api";
import type { CustomersQuery } from "../hooks/useCustomers";

/**
 * The list controls: free-text search, a VIP-tier filter, a "show deleted"
 * toggle, and the entry point to the create screen — all shadcn/ui primitives.
 * Purely presentational: it renders the current query and reports changes up to
 * useCustomers via `onChange`. The tier filter uses an "all" sentinel because
 * Radix Select forbids an empty item value. Mirrors BranchesToolbar.
 */
const ALL = "all";
const TIERS: VipTier[] = ["bronze", "silver", "gold", "platinum"];

export function CustomersToolbar({
  query,
  onChange,
}: {
  query: CustomersQuery;
  onChange: (patch: Partial<CustomersQuery>) => void;
}) {
  const tierValue = query.vipTier === "" ? ALL : query.vipTier;

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
            aria-label="Search customers"
            className="pl-9"
          />
        </div>

        <Select
          value={tierValue}
          onValueChange={(value) =>
            onChange({ vipTier: value === ALL ? "" : (value as VipTier) })
          }
        >
          <SelectTrigger aria-label="Filter by VIP tier" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tiers</SelectItem>
            {TIERS.map((tier) => (
              <SelectItem key={tier} value={tier} className="capitalize">
                {tier}
              </SelectItem>
            ))}
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

      <Can feature="customers" action="create">
        <Button asChild>
          <Link href="/dashboard/master/customers/new">
            <Plus className="size-4" />
            New customer
          </Link>
        </Button>
      </Can>
    </div>
  );
}
