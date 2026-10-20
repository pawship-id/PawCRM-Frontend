"use client";

import { useMemo, useState } from "react";

import {
  Alert,
  FilterSelect,
  Pagination,
  namedOptions,
  withAll,
} from "@/components";
import { useAuth } from "@/features/auth";
import { usePermissions } from "@/features/permissions";

import { useCatalogLookups } from "../hooks/useCatalogLookups";
import { isStockSort, useStockProducts } from "../hooks/useStockProducts";
import { StockModuleHeader } from "./StockModuleHeader";
import { StockProductsTable } from "./StockProductsTable";
import { StockProductsToolbar } from "./StockProductsToolbar";

/**
 * The stock card's front door: which product's ledger do you want to read.
 *
 * IT REPLACED A DROPDOWN, and that is the whole reason it exists. The stock card
 * used to pick its product from a select the screen filled by paging the entire
 * catalogue on mount — five requests, capped at 500 products, and a banner
 * apologising once a tenant grew past it. A catalogue is not a dropdown; it is a
 * list you search. So the choosing became a screen of its own, with the server
 * doing the searching and the paging, and the card became what you open FROM it.
 *
 * THE WAREHOUSE IS CHOSEN ABOVE, AND IT IS NOT A FILTER. Every row arrives
 * carrying its quantities for every location, so this select re-reads what is
 * already on the page rather than re-querying. Nothing is narrowed by it — the
 * same products are listed whichever way it is set. The one exception is the
 * ORDER: sorted by Stok or Nilai stok, the server sums the chosen warehouse, so
 * changing it re-fetches from page 1 (see useStockProducts).
 *
 * IT OPENS ON EVERY GUDANG, matching the catalogue and the hub, because "berapa
 * total stok produk ini" is the question somebody arriving at a list is usually
 * asking; picking a location narrows it to one shelf. It is also a value
 * available before the warehouse list arrives, so the Stok column does not start
 * blank and fill in.
 *
 * AND "EVERY GUDANG" IS EVERY GUDANG THIS ACCOUNT REACHES — decided by the
 * SERVER, not here. The dropdown has always been narrowed to them
 * (useCatalogLookups does it); the total was not, because `GET /api/products`
 * used to send `stockByWarehouse` for every location whoever was asking. So a
 * storekeeper offered one shop in the picker read the whole tenant's stock the
 * moment they left the select on its default. The API now narrows the field to
 * the caller's own shelves, so this screen simply renders what it is given.
 *
 * WHAT IS STILL DECIDED HERE IS THE WORDING. A caption that says "semua gudang"
 * to somebody who reaches two of forty is describing a different number than the
 * one on screen, and an account granted no warehouse at all reads a table of
 * zeroes with nothing to explain them. Neither is isolation; both are the screen
 * owing the reader an accurate sentence.
 *
 * THE TOTAL AND THE CARD ARE NOT THE SAME NUMBER, and this screen owes the user
 * that. A card is always one product at one warehouse — a running balance across
 * locations would claim stock is somewhere it is not — so a row showing a total
 * cannot hand the card a shelf. Two things close the gap rather than hiding it:
 * the row says how many locations its figure came from, and the link leaves the
 * warehouse unnamed so the card opens on the one holding the most.
 *
 * INACTIVE WAREHOUSES ARE OFFERED. A closed location still owns everything it
 * ever held, and a history nobody can open is an audit hole — the same reason
 * the card itself has always listed them.
 *
 * TWO PERMISSIONS MEET HERE. The route is gated on `stockMovements:read`,
 * because that is what the nav entry promises and what the destination enforces.
 * The list itself needs `products:read`, which is a separate grant — so when it
 * is missing the screen says so where the table would be, and asks for nothing.
 */
export function StockProductsScreen() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const mayReadProducts = can("products", "read");

  const lookups = useCatalogLookups({ includeInactive: true });

  /** Empty = every gudang, the repo's unset convention for a scope. */
  const [warehouseId, setWarehouseId] = useState("");

  const { products, pagination, query, loading, error, setQuery } =
    useStockProducts(mayReadProducts, warehouseId);

  /**
   * Under a stock sort a new warehouse is a new order, so the walk restarts at
   * page 1 — page 3 of one ordering is not page 3 of another.
   */
  function changeWarehouse(next: string) {
    setWarehouseId(next);
    if (isStockSort(query.sort)) setQuery({ page: 1 });
  }

  /**
   * How many shelves this account reaches — `null` when it reaches every one.
   *
   * FOR THE PROSE, NOT FOR THE FIGURES. The quantities arrive already narrowed
   * (see the header); this is what makes an all-zero table explainable rather
   * than mysterious. Read off the same list the dropdown renders, so the
   * sentence and the picker cannot describe different things.
   */
  const reach = useMemo(
    () => (user?.allBranches ? null : lookups.warehouses.length),
    [user, lookups.warehouses],
  );

  return (
    <div className="flex flex-col gap-6">
      <StockModuleHeader
        /* The Gudang selector rides in the header's action slot, where it used
           to sit beside this screen's own title — it is the one control that
           decides what every number below means, so it stays at the top. */
        action={
          // Hidden until the lookup answers: an empty dropdown that fills in a
          // moment later is a control people click twice.
          lookups.warehouses.length > 0 ? (
            <FilterSelect
              label="Gudang"
              ariaLabel="Gudang"
              value={warehouseId}
              options={withAll(
                namedOptions(lookups.warehouses, (warehouse) =>
                  warehouse.isActive
                    ? warehouse.name
                    : `${warehouse.name} (nonaktif)`,
                ),
                "Semua gudang",
              )}
              // Not a filter — nothing is narrowed by choosing a warehouse, the
              // rows simply report it. `active` navy would claim otherwise.
              active={false}
              align="end"
              onChange={changeWarehouse}
            />
          ) : null
        }
      />

      <StockProductsToolbar
        query={query}
        categories={lookups.categories}
        disabled={!mayReadProducts}
        onChange={setQuery}
      />

      {/*
        Zero reach is a configuration, not a bug in the data — and every figure
        below reads 0 because of it. Saying so is the difference between a screen
        somebody reports and one they take to their admin.
      */}
      {!lookups.loading && reach === 0 && (
        <Alert variant="info">
          Role ini belum diberi akses ke gudang mana pun, jadi semua angka stok
          dan nilainya terbaca 0. Kartu stoknya sendiri tetap bisa dibuka. Minta
          admin menambahkan akses gudang untuk role ini.
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {/* Separate from the list's own error: a role may hold products:read
          without categories:read or warehouses:read, and this says which half is
          missing rather than showing an empty dropdown. */}
      {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

      {!mayReadProducts ? (
        <div className="rounded-xl border border-dashed border-border bg-surface py-16 text-center">
          <p className="font-medium text-foreground">
            Daftar produk tidak bisa ditampilkan
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Role ini boleh membaca kartu stok, tapi belum punya izin baca
            produk. Minta admin menambahkan izin itu, atau buka kartu stoknya
            lewat tautan dari halaman detail produk.
          </p>
        </div>
      ) : (
        <>
          <StockProductsTable
            products={products}
            warehouseId={warehouseId}
            search={query.search}
            loading={loading}
            sort={query.sort}
            onSortChange={(sort) => setQuery({ sort })}
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
