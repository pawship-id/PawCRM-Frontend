"use client";

import { Plus } from "lucide-react";

import { FilterBar, FilterSearch, FilterToggle } from "@/components";
import { Button } from "@/components/ui/button";
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
 * callback instead of a Link — see CategoryFormDialog for why. FilterBar's
 * `actions` takes a node precisely so both shapes fit without it caring which.
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
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama kategori…"
          ariaLabel="Cari kategori"
        />
      }
      actions={
        <Can feature="categories" action="create">
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            Kategori baru
          </Button>
        </Can>
      }
    >
      <FilterToggle
        label="Tampilkan yang dihapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
