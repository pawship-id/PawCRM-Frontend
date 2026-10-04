"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

/**
 * The head of the Stok module, shared by both its tabs.
 *
 * WHY THESE TWO ARE ONE SCREEN. Kartu Stok answers "what happened to this
 * product" and Batch & Expired answers "what is on the shelf and how long has it
 * got" — two readings of the same stock, and a shop checking one almost always
 * checks the other. The rail listed them as two subjects.
 *
 * NO TILE ROW HERE, unlike the other three module headers, and it is the mockup
 * being satisfied elsewhere rather than skipped. Its four `i-stok` cards —
 * expired, under 7 days, under 30, value at risk — are ALREADY on the Batch &
 * Expired tab, and they belong there rather than up here for a reason that
 * outranks symmetry: `useBatchSummary` is keyed on that screen's own branch and
 * warehouse filters, so the counts always describe the rows underneath them. A
 * copy in this header would know nothing about those filters, so a reader who
 * narrowed to one warehouse would get a tenant-wide row of tiles sitting above a
 * one-warehouse table — two numbers for the same question, neither reconcilable
 * against the other.
 */
export function StockModuleHeader({
  /** The Gudang selector on the Kartu Stok tab — see StockProductsScreen. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadLedger = can("stockMovements", "read");
  const mayReadBatches = can("productBatches", "read");

  const tabs: PageTab[] = [
    // Prefix-matched (no `exact`): /stock-card/[productId] IS this tab — one
    // product's card is what the index exists to open.
    ...(mayReadLedger
      ? [{ label: "Kartu Stok", href: "/dashboard/inventory/stock-card" }]
      : []),
    ...(mayReadBatches
      ? [{ label: "Batch & Expired", href: "/dashboard/inventory/batches" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              { label: "Stok" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">Stok</h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian stok" />
    </div>
  );
}
