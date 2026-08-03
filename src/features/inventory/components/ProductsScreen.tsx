"use client";

import { useEffect, useState } from "react";

import { Alert, Breadcrumb, Pagination, Spinner } from "@/components";

import { useCatalogLookups } from "../hooks/useCatalogLookups";
import { useProducts } from "../hooks/useProducts";
import { ProductsTable } from "./ProductsTable";
import { ProductsToolbar } from "./ProductsToolbar";

/**
 * The catalogue list: standalone products, variant families, and bundles.
 *
 * Owns the list query (useProducts) and the reference lists the toolbar needs,
 * and wires them to the table and the pager. Row mutations call `refetch`, so
 * the list reflects a delete or a restore without a reload. Mirrors
 * CustomersScreen; what is specific to this screen is the WAREHOUSE selector.
 *
 * THE WAREHOUSE IS A VIEW, NOT A FILTER. Every product arrives carrying its
 * quantities for every warehouse it has any in, so switching location re-reads
 * data already on the page instead of issuing a request. It is kept here rather
 * than in the table because it is a property of the screen — what "Stok" means
 * on it — not of any row.
 */
export function ProductsScreen() {
  const { products, pagination, query, loading, error, setQuery, refetch } =
    useProducts();
  const lookups = useCatalogLookups();

  const [warehouseId, setWarehouseId] = useState("");

  // The first warehouse becomes the default view once the list arrives. Not a
  // fetch, so no cleanup: it runs once, when an empty selection can be filled.
  useEffect(() => {
    if (!warehouseId && lookups.warehouses.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWarehouseId(lookups.warehouses[0]._id);
    }
  }, [lookups.warehouses, warehouseId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Produk & Varian" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Produk &amp; Varian
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Produk biasa, produk dengan varian dua tingkat (ukuran × rasa), dan
          bundle. Produk induk tidak menyimpan stok — stoknya ada di varian.
        </p>
      </div>

      <ProductsToolbar
        query={query}
        categories={lookups.categories}
        warehouses={lookups.warehouses}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        onChange={setQuery}
      />

      {error && <Alert variant="error">{error}</Alert>}
      {/* Separate from the list's own error: a role may hold products:read
          without categories:read or warehouses:read, and the catalogue still
          renders — with category names and the stock column missing, which this
          says out loud rather than showing as empty cells. */}
      {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat katalog…
        </div>
      ) : (
        <>
          <ProductsTable
            products={products}
            categories={lookups.categories}
            warehouseId={warehouseId}
            loading={loading}
            onChanged={refetch}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="produk"
            unitPlural="produk"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
