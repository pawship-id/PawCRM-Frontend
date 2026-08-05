"use client";

import { useState } from "react";

import { Alert, Breadcrumb, Pagination, Spinner } from "@/components";
import type { Category } from "@/types/api";

import { useCategories } from "../hooks/useCategories";
import { CategoriesTable } from "./CategoriesTable";
import { CategoriesToolbar } from "./CategoriesToolbar";
import { CategoryFormDialog } from "./CategoryFormDialog";

/** Which dialog is open: none, create, or rename that category. */
type DialogState = { mode: "create" } | { mode: "edit"; category: Category } | null;

/**
 * The Inventory → Kategori screen. Owns the list query and the one dialog the
 * create button and every rename action share.
 *
 * ONE DIALOG SLOT rather than one per row: only one can be open, and holding
 * the state here is what makes that true by construction instead of by
 * coincidence. `key` remounts it between targets so the name field starts from
 * the right value — without it, renaming B straight after A would open with A's
 * name still in state.
 */
export function CategoriesScreen() {
  const { categories, pagination, query, loading, error, setQuery, refetch } =
    useCategories();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Kategori" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Kategori</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pengelompokan produk di katalog dan laporan. Sebuah kategori hanya
          punya nama — harga, stok, dan aturan lainnya ada di produknya.
        </p>
      </div>

      <CategoriesToolbar
        query={query}
        onChange={setQuery}
        onCreate={() => setDialog({ mode: "create" })}
      />

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
            onEdit={(category) => setDialog({ mode: "edit", category })}
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

      {dialog && (
        <CategoryFormDialog
          key={dialog.mode === "edit" ? dialog.category._id : "create"}
          category={dialog.mode === "edit" ? dialog.category : undefined}
          onClose={() => setDialog(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
