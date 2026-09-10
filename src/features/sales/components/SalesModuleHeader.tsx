"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

/**
 * The head of the Penjualan module, worn by all four of its tabs.
 *
 * THE FOUR TABS ARE THE MOCKUP'S, and two of them open on "belum tersedia":
 *
 *   Faktur      — the invoice list, the only built screen in the module.
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
export function SalesModuleHeader({
  /** The create affordance for the tab you are on — only Faktur has one. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadInvoices = can("customerInvoices", "read");

  const tabs: PageTab[] = [
    ...(mayReadInvoices
      ? [
          // EXACT, because Piutang and Retur are routes UNDER this one. Left
          // prefix-matched it would sit lit beside whichever of them is open.
          { label: "Faktur", href: "/dashboard/sales", exact: true },
          // Gated with Faktur: it describes that list's unpaid half, so a role
          // that may not read invoices has nothing to be told about here.
          { label: "Piutang", href: "/dashboard/sales/piutang" },
        ]
      : []),
    // Ungated, both of them: neither has a feature in the catalogue to gate on,
    // and neither page holds anything to protect.
    { label: "E-commerce", href: "/dashboard/ecommerce-sync" },
    { label: "Retur", href: "/dashboard/sales/retur" },
  ];

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
