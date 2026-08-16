import type { Crumb } from "@/components";

/**
 * The ancestors every purchasing trail is built from.
 *
 * Eleven pages sit under this module and each one's trail begins with the same
 * one or two entries. Typing them out per page is how a breadcrumb quietly
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
  hub: { label: "Purchasing", href: "/dashboard/purchasing" },
  suppliers: { label: "Supplier", href: "/dashboard/purchasing/suppliers" },
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
