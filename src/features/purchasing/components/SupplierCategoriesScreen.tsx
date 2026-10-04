"use client";

import { Alert, Pagination, Spinner } from "@/components";
import { SettingsPageHeader } from "@/features/settings";

import { useSupplierCategories } from "../hooks/useSupplierCategories";
import { SupplierCategoriesTable } from "./SupplierCategoriesTable";
import { SupplierCategoriesToolbar } from "./SupplierCategoriesToolbar";

/**
 * The Kategori Supplier screen. Owns the list query and nothing else; the row
 * actions live on the table and the two write verbs are routes of their own
 * (`/new` and `/:id`).
 *
 * REACHED FROM PENGATURAN › UMUM, NOT FROM A PEMBELIAN TAB (1 October 2026, on
 * request) — hence `SettingsPageHeader` rather than `PurchasingModuleHeader`.
 * The component and its two forms stayed in `features/purchasing`, where the
 * collection and its service live; only the way in, and the URL
 * (`SETTINGS_PATHS.kategoriSupplier`), moved.
 *
 * STILL GROUPED BY WHO USES IT, not by storage, which is why it is not simply
 * folded into the product Kategori screen even though the two share a
 * collection on the backend: a product category is filled in while entering an
 * item, a supplier category while setting up a vendor. That reasoning is also
 * why it sits in Pengaturan rather than Inventory now that it has left
 * Pembelian — a vendor label set is master data somebody edits rarely, same as
 * Tipe supplier beside it.
 */
export function SupplierCategoriesScreen() {
  const { categories, pagination, query, loading, error, setQuery, refetch } =
    useSupplierCategories();

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        title="Kategori Supplier"
        tab="umum"
        description="Kelompok seperti Makanan, Perlengkapan, atau Obat — dipakai untuk memilah supplier, bukan untuk harga atau pajak."
      />

      <SupplierCategoriesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && categories.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat kategori supplier…
        </div>
      ) : (
        <>
          <SupplierCategoriesTable
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
