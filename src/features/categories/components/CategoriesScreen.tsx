"use client";

import { Alert, Breadcrumb, Pagination, Spinner } from "@/components";

import { useCategories } from "../hooks/useCategories";
import { CategoriesTable } from "./CategoriesTable";
import { CategoriesToolbar } from "./CategoriesToolbar";

/**
 * The Inventory → Kategori screen. Owns the list query and nothing else.
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
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Kategori" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">Kategori</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pengelompokan produk di katalog dan laporan. Sebuah kategori hanya
          punya nama, deskripsi, dan gambar — harga, stok, dan aturan lainnya
          ada di produknya.
        </p>
      </div>

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
