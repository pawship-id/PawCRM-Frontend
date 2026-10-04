"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Pagination, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { CatalogModuleHeader } from "@/features/inventory";
import { Can } from "@/features/permissions";

import { useCategories } from "../hooks/useCategories";
import { CategoriesTable } from "./CategoriesTable";
import { CategoriesToolbar } from "./CategoriesToolbar";

/**
 * The Kategori tab of the Produk & Varian module. Owns the list query and
 * nothing else.
 *
 * IT WEARS THE CATALOGUE MODULE'S HEADER, which is the point of the tab bar: the
 * rail has one row for Produk & Varian now, and this route is one of its tabs.
 * Importing from `@/features/inventory` rather than copying the header is the
 * same call PetsScreen makes for the Pelanggan module's — the module owns it,
 * and its public surface is where it is borrowed from.
 *
 * IT USED TO OWN A DIALOG TOO — one slot shared by the create button and every
 * row's rename action, so that only one could be open at a time. Both now
 * navigate to a route of their own (`/new` and `/:id`), which makes that
 * guarantee structural rather than something this component had to hold: there
 * is one page, and you are either on it or not. See CategoryForm for why the
 * form left the modal.
 *
 * What went with it is worth naming, because it was the dialog's best argument:
 * the list stayed on screen while a name was typed, and the list is what tells
 * you whether that name already exists. The 409 still catches a clash — it just
 * arrives after a save now rather than being visible before one.
 */
export function CategoriesScreen() {
  const { categories, pagination, query, loading, error, setQuery, refetch } =
    useCategories();

  return (
    <div className="flex flex-col gap-6">
      <CatalogModuleHeader
        action={
          <Can feature="categories" action="create">
            {/* `asChild` so the Link IS the button — nesting an <a> inside a
                <button> is invalid markup and gives a screen reader two
                controls where there is one. */}
            <Button asChild>
              <Link href="/dashboard/inventory/categories/new">
                <Plus className="size-4" />
                Kategori baru
              </Link>
            </Button>
          </Can>
        }
      />

      <CategoriesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && categories.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat kategori…
        </div>
      ) : (
        <>
          <CategoriesTable
            categories={categories}
            loading={loading}
            search={query.search}
            onChanged={refetch}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="kategori"
            unitPlural="kategori"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
