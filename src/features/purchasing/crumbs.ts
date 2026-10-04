import type { Crumb } from "@/components";
import { SETTINGS_PATHS, SETTINGS_TABS } from "@/features/settings/paths";

/**
 * The ancestors every purchasing trail is built from.
 *
 * Fourteen pages sit under this module and each one's trail begins with the
 * same one or two entries. Typing them out per page is how a breadcrumb quietly
 * rots: a label drifts from the sidebar's wording, or an href keeps pointing at
 * a route that has moved, and neither shows up as a broken page — just a trail
 * that lies about where you are.
 *
 * LABELS MATCH THE SIDEBAR EXACTLY (features/dashboard/nav.ts). A user who
 * clicked "Penerimaan Barang" in the menu should see "Penerimaan Barang" in the
 * trail; renaming one and not the other makes them read as two different places.
 *
 * These are ANCESTORS only — always a link. The crumb for the page you are on
 * is written inline at the page, without an href, which is what marks it as the
 * current one. See components/Breadcrumb.
 */
export const PURCHASING_CRUMBS = {
  hub: { label: "Pembelian", href: "/dashboard/purchasing" },
  /**
   * WHERE THE KATEGORI SUPPLIER PAGES HANG FROM (1 October 2026, on request),
   * in place of `hub`: the tab was dropped from Pembelian and the screen is
   * opened from a card on Pengaturan › Umum instead, so a trail still beginning
   * "Pembelian" would offer a first step back to a module that no longer lists
   * it anywhere. Supplier itself kept its tab and still trails from `hub`.
   */
  settings: { label: "Pengaturan", href: SETTINGS_TABS.umum },
  suppliers: { label: "Supplier", href: "/dashboard/purchasing/suppliers" },
  /** The list moved to `SETTINGS_PATHS.kategoriSupplier`; its forms follow. */
  supplierCategories: {
    label: "Kategori Supplier",
    href: SETTINGS_PATHS.kategoriSupplier,
  },
  receipts: {
    label: "Penerimaan Barang",
    href: "/dashboard/purchasing/receipts",
  },
  payables: {
    label: "Faktur Pembelian",
    href: "/dashboard/purchasing/payables",
  },
  returns: { label: "Retur ke Supplier", href: "/dashboard/purchasing/returns" },
} satisfies Record<string, Crumb>;

/** The trail to one supplier's detail page — the only crumb built per-row. */
export function supplierCrumb(supplierId: string): Crumb {
  return {
    label: "Detail supplier",
    href: `/dashboard/purchasing/suppliers/${supplierId}`,
  };
}
