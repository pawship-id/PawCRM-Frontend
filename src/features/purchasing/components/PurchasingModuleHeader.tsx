"use client";

import type { ReactNode } from "react";

import { PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";

/**
 * The head of the Pembelian module, worn by every screen in it except Kategori
 * Supplier.
 *
 * A SUBTITLE AND NO BREADCRUMB (1 October 2026, on request), which is the
 * mockup's own `head('Pembelian', 'Faktur pemasok, …')`: its `crumbs()` draws a
 * trail only for a page with a PARENT — Layanan › Grooming, Inventori › Produk
 * & Varian — and a top-level module gets none. The crumb here was a single item
 * reading "Pembelian" directly above an `h1` reading "Pembelian", so what went
 * is a word printed twice and what arrived says what the module is for.
 *
 * IT IS THE ONLY MODULE HEADER LIKE THIS SO FAR. Penjualan, Pelanggan, Keuangan
 * and the three Inventori headers still carry the same one-item crumb over the
 * same repeated title, and none of them carries a subtitle. Do not sweep them
 * unasked (ui-rules §15) — but this is the shape to copy when one is asked for.
 *
 * KATEGORI SUPPLIER IS NOT A TAB HERE (1 October 2026, on request — corrected
 * the same day from an earlier pass that moved Supplier itself instead). The
 * list and its two forms are all untouched and still live under
 * `SETTINGS_PATHS.kategoriSupplier` — what moved is the WAY IN: a card on
 * Pengaturan › Umum, beside Tipe supplier, and `SupplierCategoriesScreen` wears
 * `SettingsPageHeader` so the page it opens says where it came from. A label
 * set edited once in a while is master data, not one of the four things a
 * purchase actually does, and the tab row is shorter for the screens that are.
 *
 * SUPPLIER KEEPS ITS TAB. It is read, chosen and filtered constantly from
 * inside Pembelian — the receipts and payables toolbars both offer one, the
 * tables link to each vendor's detail — and it is also where a purchase starts:
 * unlike a category, picking a supplier is a step in making one.
 *
 * FIVE TABS, WHICH IS ONE MORE THAN THE MOCKUP DRAWS — and deliberately so for
 * now: the landing page is the one the mockup folds away, and folding it here
 * too would leave a live route reachable only by typing a URL. It comes out
 * when the mockup's own answer for it is built. Kategori Supplier is the tab
 * that already has its answer, above.
 *
 * THE OTHER FOUR MATCH THE MOCKUP'S OWN LABELS AND ORDER EXACTLY (1 October
 * 2026, corrected on request — an earlier pass had kept the longer names and
 * the rail's purchase-order sequencing instead): Faktur, Penerimaan, Supplier,
 * Retur. The mockup's own tab objects are `[['faktur','Faktur'],
 * ['terima','Penerimaan'],['supplier','Supplier'],['retur','Retur']]` — short
 * nouns, not the fuller "Faktur Pembelian" / "Penerimaan Barang" / "Retur ke
 * Supplier" this row used to carry, which were this app's own addition.
 *
 * NO TILE ROW ON THE HEADER ITSELF, unlike the Pelanggan and Produk & Varian
 * headers — it is shared across all five tabs, and the mockup's cards are all
 * about invoices. The Ringkasan tab carries its own three (total hutang
 * supplier, hutang belum lunas, hutang terbayar periode ini); the Faktur tab
 * carries the mockup's OWN four-card strip in its body, above its search box
 * (1 October 2026 — see `PayablesScreen`). Hoisting either set into this shared
 * header would put them above the supplier register too, and would double
 * figures that already exist a tab away.
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
    // matching would leave this tab lit on all five screens.
    exact: true,
  },
  {
    label: "Faktur",
    href: "/dashboard/purchasing/payables",
    permission: { feature: "purchaseInvoices", action: "read" },
  },
  {
    label: "Penerimaan",
    href: "/dashboard/purchasing/receipts",
    permission: { feature: "goodsReceipts", action: "read" },
  },
  {
    label: "Supplier",
    href: "/dashboard/purchasing/suppliers",
    permission: { feature: "suppliers", action: "read" },
  },
  {
    label: "Retur",
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
          <h1 className="text-2xl font-extrabold text-foreground">Pembelian</h1>
          {/* The mockup's own subtitle, in the shape `PageHeading` gives one. */}
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Faktur pemasok, penerimaan barang, dan utang.
          </p>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      {/* Five tabs is wider than a phone; PageTabs scrolls its own row rather
          than wrapping, so the tab bar never becomes two lines of chrome above
          a table. */}
      <PageTabs tabs={tabs} ariaLabel="Bagian pembelian" />
    </div>
  );
}
