"use client";

import { useState } from "react";

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
 *
 * IT OPENS ON EVERY GUDANG, which is the question the catalogue is usually asked
 * ("how much of this do we have?"), and picking locations narrows it. The
 * original default — whichever warehouse happened to sort first — answered a
 * question nobody had asked and read as a total, so a tenant with stock split
 * across two locations saw a number that was quietly short. It is also a value
 * available before the warehouse list arrives, so the Stok column no longer
 * starts blank and fills in.
 *
 * ANY NUMBER OF WAREHOUSES CAN BE PICKED, held here as a list of ids where the
 * EMPTY LIST MEANS EVERY ONE. Two shops out of five is a real question — "can
 * the Jakarta branches cover this order between them" — and answering it by
 * reading two numbers off two loads of the page and adding them by hand is
 * exactly the arithmetic this column exists to do.
 *
 * "EVERY ONE" IS EVERY ONE THIS ACCOUNT REACHES, and the SERVER decides which.
 * `GET /api/products` used to send `stockByWarehouse` for every location
 * whoever was asking, so the empty scope added up the tenant's stock for a
 * storekeeper whose picker offered them one shop. The API narrows the field to
 * the caller's own shelves now (PawCRM-Backend, `#stockScope`), so this screen
 * adds up what it is given and re-deciding it here would be a second copy of the
 * rule over the same number.
 */
export function ProductsScreen() {
  const { products, pagination, query, loading, error, setQuery, refetch } =
    useProducts();
  const lookups = useCatalogLookups();

  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Produk & Varian" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Produk &amp; Varian
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Produk satuan, produk dengan varian dua tingkat (ukuran × rasa), dan
          bundle.
        </p>
      </div>

      <ProductsToolbar
        query={query}
        categories={lookups.categories}
        warehouses={lookups.warehouses}
        warehouseIds={warehouseIds}
        onWarehouseChange={setWarehouseIds}
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
            warehouseIds={warehouseIds}
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
