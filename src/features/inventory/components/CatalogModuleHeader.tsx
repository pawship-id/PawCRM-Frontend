"use client";

import type { ReactNode } from "react";

import {
  Breadcrumb,
  PageTabs,
  PendingStatTile,
  StatTile,
  type PageTab,
} from "@/components";
import { usePermissions } from "@/features/permissions";

import { useCatalogCounts, type CatalogCount } from "../hooks/useCatalogCounts";

/**
 * The head of the Produk & Varian module, shared by both its tabs — the title,
 * the tab row, and what the catalogue adds up to.
 *
 * ONE HEADER FOR TWO ROUTES. /inventory/products and /inventory/categories are
 * separate screens with separate grants, but the mockup
 * (buloo-navbar-v3.html, `i-prod`) draws them as one page with two tabs, and the
 * rail now has one row for both. Rendering the same header from both is what
 * makes the two routes read as the one module the menu says they are.
 *
 * THE TITLE IS "Produk & Varian" ON BOTH TABS: the tab says which list you are
 * looking at, the title says which module you are in. Same arrangement as the
 * Pelanggan module's header, deliberately — these are the first two modules to
 * take the mockup's tabbed shape, and a reader crossing between them should not
 * find two conventions.
 *
 * NO SCOPE ROW, and the mockup agrees: the catalogue is tenant-wide — one SKU is
 * the same SKU in every branch. What differs per warehouse is the STOCK, which
 * is why the warehouse picker lives on the products toolbar (where it changes a
 * column) rather than up here as a filter over the page.
 */
export function CatalogModuleHeader({
  /** The create affordance for the tab you are on. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadProducts = can("products", "read");
  const mayReadCategories = can("categories", "read");

  const counts = useCatalogCounts(mayReadProducts, mayReadCategories);

  const tabs: PageTab[] = [
    ...(mayReadProducts
      ? [{ label: "Produk", href: "/dashboard/inventory/products" }]
      : []),
    ...(mayReadCategories
      ? [{ label: "Kategori", href: "/dashboard/inventory/categories" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              { label: "Produk & Varian" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Produk &amp; Varian
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian katalog" />

      <section
        aria-label="Ringkasan katalog"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {mayReadProducts && (
          <>
            <StatTile
              label="Produk"
              value={NUMBER.format(counts.products.total)}
              caption="satuan, induk varian, dan bundle"
              loading={counts.products.loading}
              error={counts.products.error}
            />
            <StatTile
              label="Varian"
              value={NUMBER.format(counts.variants.total)}
              caption={perProduct(counts.variants, counts.products)}
              loading={counts.variants.loading}
              error={counts.variants.error}
            />
          </>
        )}
        {mayReadCategories && (
          <StatTile
            label="Kategori"
            value={NUMBER.format(counts.categories.total)}
            caption="pengelompokan di katalog dan laporan"
            loading={counts.categories.loading}
            error={counts.categories.error}
          />
        )}

        {/*
          THE ONE THE MOCKUP ASKS FOR AND THE API CANNOT ANSWER. `categoryId`
          takes an id, and there is no value meaning "none" — so "how many are
          still unfiled" cannot be asked without paging the whole catalogue.

          The mockup's fourth tile, "Tanpa barcode", is left off rather than
          badged beside this one: it is blocked on the very same missing filter,
          and two identical "Segera" cards in a row of four teach people to stop
          reading the row.
        */}
        <PendingStatTile
          label="Tanpa kategori"
          blockedBy="Katalog belum bisa disaring untuk produk tanpa kategori"
        />
      </section>
    </div>
  );
}

const NUMBER = new Intl.NumberFormat("id-ID");
const ONE_DECIMAL = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * "2,1 per produk" — the mockup's caption under the variant count.
 *
 * Empty while either side is unknown, and on an empty catalogue: 0 products is a
 * division, not a fact. Empty too when nothing has variants, where "0,0 per
 * produk" would be arithmetic nobody asked for.
 */
function perProduct(variants: CatalogCount, products: CatalogCount): string {
  if (variants.loading || variants.error || products.loading || products.error)
    return "";
  if (products.total === 0 || variants.total === 0) return "";
  return `${ONE_DECIMAL.format(variants.total / products.total)} per produk`;
}
