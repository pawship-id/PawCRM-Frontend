import type { GatedTab } from "@/features/permissions";

/**
 * Inventori's pages and tabs, each opened by its own "Lihat" (14 October 2026).
 * A route a role may not open sends it on through these — Ringkasan to the
 * first page allowed, Produk to Kategori, Kartu Stok to Batch, Opname to
 * Penyesuaian — rather than to "akses ditolak".
 */
export const INVENTORY_TAB = {
  summary: {
    label: "Ringkasan",
    href: "/dashboard/inventory",
    exact: true,
    anyOf: [{ feature: "inventorySummary" }],
  },
  products: {
    label: "Produk",
    href: "/dashboard/inventory/products",
    anyOf: [{ feature: "products" }],
  },
  categories: {
    label: "Kategori",
    href: "/dashboard/inventory/categories",
    anyOf: [{ feature: "categories" }],
  },
  stockCard: {
    label: "Kartu Stok",
    href: "/dashboard/inventory/stock-card",
    anyOf: [{ feature: "stockMovements" }],
  },
  batches: {
    label: "Batch & Expired",
    href: "/dashboard/inventory/batches",
    anyOf: [{ feature: "productBatches" }],
  },
  opname: {
    label: "Opname",
    href: "/dashboard/inventory/opname",
    anyOf: [{ feature: "stockOpnames" }],
  },
  adjustments: {
    label: "Penyesuaian",
    href: "/dashboard/inventory/adjustments",
    anyOf: [{ feature: "stockAdjustments" }],
  },
  transfers: {
    label: "Transfer Stok",
    href: "/dashboard/inventory/transfers",
    anyOf: [{ feature: "stockTransfers" }],
  },
  openingStock: {
    label: "Stok Awal",
    href: "/dashboard/inventory/opening-stock",
    anyOf: [{ feature: "openingStock" }],
  },
} satisfies Record<string, GatedTab>;

/** Every Inventori page, in menu order. */
export const INVENTORY_PAGES: GatedTab[] = Object.values(INVENTORY_TAB);
