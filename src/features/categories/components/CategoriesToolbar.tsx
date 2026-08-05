"use client";

import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Can } from "@/features/permissions";

import type { CategoriesQuery } from "../hooks/useCategories";

/**
 * The list controls: free-text search, a "show deleted" toggle, and the create
 * button.
 *
 * Purely presentational — it renders the current query and reports changes up.
 * There is no state filter here the way branches have one: a category is either
 * live or deleted, with no active/inactive axis in between, so the checkbox is
 * the whole of it.
 *
 * The create button opens a dialog rather than navigating, so `onCreate` is a
 * callback instead of a Link — see CategoryFormDialog for why.
 */
export function CategoriesToolbar({
  query,
  onChange,
  onCreate,
}: {
  query: CategoriesQuery;
  onChange: (patch: Partial<CategoriesQuery>) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Cari nama kategori…"
            aria-label="Cari kategori"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-deleted-categories"
            checked={query.includeDeleted}
            onCheckedChange={(checked) =>
              onChange({ includeDeleted: checked === true })
            }
          />
          <Label htmlFor="show-deleted-categories" className="font-normal">
            Tampilkan yang dihapus
          </Label>
        </div>
      </div>

      <Can feature="categories" action="create">
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          Kategori baru
        </Button>
      </Can>
    </div>
  );
}
