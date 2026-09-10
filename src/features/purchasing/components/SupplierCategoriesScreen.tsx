"use client";

import { Alert, Pagination, Spinner } from "@/components";

import { useSupplierCategories } from "../hooks/useSupplierCategories";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";
import { SupplierCategoriesTable } from "./SupplierCategoriesTable";
import { SupplierCategoriesToolbar } from "./SupplierCategoriesToolbar";

/**
 * The Purchasing → Kategori Supplier screen. Owns the list query and nothing
 * else; the row actions live on the table and the two write verbs are routes of
 * their own (`/new` and `/:id`).
 *
 * IN PURCHASING RATHER THAN NEXT TO THE PRODUCT KATEGORI SCREEN, even though
 * the two share a collection on the backend. The screens are used by different
 * people for different jobs: a product category is filled in while entering an
 * item, a supplier category while setting up a vendor. Grouping by storage
 * rather than by use would put a purchasing setup screen inside Inventory,
 * where nobody doing purchasing would look for it.
 */
export function SupplierCategoriesScreen() {
  const { categories, pagination, query, loading, error, setQuery, refetch } =
    useSupplierCategories();

  return (
    <div className="flex flex-col gap-6">
      <PurchasingModuleHeader />

      {/* What the module header cannot say, because it is on every tab: what
          THIS list is. */}
      <p className="max-w-2xl text-sm text-muted">
        Pengelompokan supplier — misalnya distributor, agen, atau peternak
        lokal. Isinya cuma nama; termin, NPWP, dan sisa utang ada di data
        suppliernya.
      </p>

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
