"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import {
  usePermissions,
  visibleTabs,
  type GatedTab,
} from "@/features/permissions";

/**
 * The head of the Penjualan module, worn by all five of its tabs.
 *
 * THE FIVE TABS ARE THE MOCKUP'S, and two of them open on "belum tersedia":
 *
 *   Ringkasan   — where the period's omzet came from, rather than what each
 *                 bill's status is. THE MODULE'S LANDING PAGE since 29 September
 *                 2026: it holds `/dashboard/sales`, so the rail's Penjualan row
 *                 opens here.
 *   Faktur      — the invoice list, at `/dashboard/sales/invoice` with every
 *                 invoice screen under it (detail, print, payment, the create
 *                 form). It used to be the landing page.
 *   Piutang     — not a screen yet. It is a LENS on Faktur today (the pill row's
 *                 default), which is exactly why it cannot simply link there:
 *                 two tabs pointing at one route is one of them lying.
 *   E-commerce  — a placeholder since before this module had tabs, at a route
 *                 that predates it (/dashboard/ecommerce-sync).
 *   Retur       — no sales-return feature exists at all; there is not even a
 *                 permission in the RBAC catalogue for one.
 *
 * NO TILE ROW, unlike the Pelanggan and Produk & Varian headers. The mockup's
 * four `penjualan` cards are all about invoices — omzet, belum lunas, jatuh
 * tempo — and three of them are ALREADY on the Faktur tab beside the table they
 * describe. Hoisting them would put "total piutang berjalan" above a page that
 * says e-commerce sync is not built yet.
 */
/**
 * Penjualan's tabs, each opened by its own "Lihat" in the role editor
 * (14 October 2026). Also what the Ringkasan route redirects through when a
 * role may not see it.
 */
export const SALES_TABS: GatedTab[] = [
  /*
    THE MODULE'S FRONT PAGE, and its landing route since 29 September 2026.
    EXACT, because every other tab is a route UNDER this one.
  */
  {
    label: "Ringkasan",
    href: "/dashboard/sales",
    exact: true,
    anyOf: [{ feature: "salesSummary" }],
  },
  /*
    PREFIX-MATCHED: a bill's detail, its print view and one of its payments all
    live under `/invoice`, and every one of them keeps this tab lit.
  */
  { label: "Faktur", href: "/dashboard/sales/invoice", anyOf: [{ feature: "customerInvoices" }] },
  { label: "Piutang", href: "/dashboard/sales/piutang", anyOf: [{ feature: "receivables" }] },
  { label: "E-commerce", href: "/dashboard/ecommerce-sync", anyOf: [{ feature: "ecommerce" }] },
  { label: "Retur", href: "/dashboard/sales/retur", anyOf: [{ feature: "salesReturns" }] },
];

export function SalesModuleHeader({
  /** The create affordance for the tab you are on — only Faktur has one. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const tabs = visibleTabs(SALES_TABS, can);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Penjualan" }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Penjualan
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian penjualan" />
    </div>
  );
}
