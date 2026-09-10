"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";

/**
 * The head of the Pembelian module, worn by all six of its screens.
 *
 * SIX TABS, WHICH IS MORE THAN THE MOCKUP DRAWS (it has four: Faktur,
 * Penerimaan, Supplier, Retur) — and deliberately so for now. Every screen that
 * had a menu row keeps a way in: the landing page and Kategori Supplier are the
 * two the mockup folds away, and folding them here would leave two live routes
 * reachable only by typing a URL. They come out when the mockup's own answer for
 * them is built.
 *
 * THE ORDER IS THE ONE THE RAIL USED, and it is the order a purchase actually
 * unfolds rather than the order the screens were written: the landing page,
 * then the vendor and how they are filed, then their goods arriving, then what
 * is owed for them, then what goes back. A reader learning the module
 * left-to-right learns it in the right order.
 *
 * NO TILE ROW, unlike the Pelanggan and Produk & Varian headers. The mockup's
 * four `pembelian` cards are all about invoices — pembelian periode, utang belum
 * lunas, jatuh tempo ≤7 hari — and every one of them is ALREADY on the Faktur
 * Pembelian tab, beside the table they describe, plus two more on the Ringkasan
 * tab. Hoisting them would put "total sisa utang" above a list of vendor
 * categories, and would double figures that already exist a tab away.
 */
const TABS: Array<{
  label: string;
  href: string;
  exact?: boolean;
  /** Omitted on the hub, which gates each of its own cards. */
  permission?: { feature: Feature; action: Action };
}> = [
  {
    label: "Ringkasan",
    href: "/dashboard/purchasing",
    // EXACT, because its href is the prefix of every sibling's — prefix
    // matching would leave this tab lit on all six screens.
    exact: true,
  },
  {
    label: "Supplier",
    href: "/dashboard/purchasing/suppliers",
    permission: { feature: "suppliers", action: "read" },
  },
  {
    label: "Kategori Supplier",
    href: "/dashboard/purchasing/supplier-categories",
    permission: { feature: "supplierCategories", action: "read" },
  },
  {
    label: "Penerimaan Barang",
    href: "/dashboard/purchasing/receipts",
    permission: { feature: "goodsReceipts", action: "read" },
  },
  {
    label: "Faktur Pembelian",
    href: "/dashboard/purchasing/payables",
    permission: { feature: "purchaseInvoices", action: "read" },
  },
  {
    label: "Retur ke Supplier",
    href: "/dashboard/purchasing/returns",
    permission: { feature: "purchaseReturns", action: "read" },
  },
];

export function PurchasingModuleHeader({
  /** The create affordance for the tab you are on — each one makes a different thing. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();

  const tabs: PageTab[] = TABS.filter(
    (tab) =>
      !tab.permission || can(tab.permission.feature, tab.permission.action),
  ).map(({ label, href, exact }) => ({ label, href, exact }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Pembelian" }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Pembelian
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      {/* Six tabs is wider than a phone; PageTabs scrolls its own row rather
          than wrapping, so the tab bar never becomes two lines of chrome above
          a table. */}
      <PageTabs tabs={tabs} ariaLabel="Bagian pembelian" />
    </div>
  );
}
