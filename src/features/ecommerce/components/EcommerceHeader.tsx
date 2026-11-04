"use client";

import { useState } from "react";
import { Download, FileDown, Wallet } from "lucide-react";

import { PageTabs } from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions, visibleTabs, type GatedTab } from "@/features/permissions";
import { SalesModuleHeader } from "@/features/sales";
import type { MarketplaceStore } from "@/types/marketplace";

import { ECOMMERCE_HREF, ECOMMERCE_SETTINGS_HREF, ECOMMERCE_SKU_HREF } from "../labels";
import { OrderImportDialog } from "./OrderImportDialog";
import { SettlementImportDialog } from "./SettlementImportDialog";
import { StockExportDialog } from "./StockExportDialog";

const TABS: GatedTab[] = [
  { label: "Ringkasan", href: ECOMMERCE_HREF, exact: true, anyOf: [{ feature: "ecommerce" }] },
  { label: "Pengikatan SKU", href: ECOMMERCE_SKU_HREF, anyOf: [{ feature: "ecommerce" }] },
  { label: "Pengaturan", href: ECOMMERCE_SETTINGS_HREF, anyOf: [{ feature: "ecommerce" }] },
];

/**
 * The head of Penjualan › E-commerce: the module header with the tab's one
 * action, then the tab's own sub-tabs — Ringkasan, Pengikatan SKU,
 * Pengaturan. REAL ROUTES, like Promosi › Membership's sub-tabs. The store
 * picked on one carries to the next through `useSelectedStore`, not the link:
 * PageTabs marks the current tab by path, and a query on the href would leave
 * none of them current.
 *
 * Three header actions, each a wizard and each behind its own grant: Impor
 * pesanan, Ekspor stok, Impor pencairan. `onChanged` reloads the screen
 * after any of them saved something.
 */
export function EcommerceHeader({
  stores,
  storeId,
  onChanged,
}: {
  stores: MarketplaceStore[];
  storeId?: string | null;
  onChanged?: () => void;
}) {
  const { can } = usePermissions();
  const [open, setOpen] = useState<"orders" | "export" | "settlement" | null>(null);
  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-4">
      <SalesModuleHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Can feature="ecommerce" action="importOrders">
              <Button type="button" onClick={() => setOpen("orders")}>
                <FileDown className="size-4" aria-hidden />
                Impor pesanan
              </Button>
            </Can>
            <Can feature="ecommerce" action="export">
              <Button type="button" variant="secondary" onClick={() => setOpen("export")}>
                <Download className="size-4" aria-hidden />
                Ekspor stok
              </Button>
            </Can>
            <Can feature="ecommerce" action="settle">
              <Button type="button" variant="secondary" onClick={() => setOpen("settlement")}>
                <Wallet className="size-4" aria-hidden />
                Impor pencairan
              </Button>
            </Can>
          </div>
        }
      />
      <PageTabs tabs={visibleTabs(TABS, can)} ariaLabel="Bagian e-commerce" />

      {open === "orders" ? (
        <OrderImportDialog
          stores={stores}
          initialStoreId={storeId ?? null}
          onClose={close}
          onDone={onChanged}
        />
      ) : null}
      {open === "export" ? (
        <StockExportDialog
          stores={stores}
          initialStoreId={storeId ?? null}
          onClose={close}
          onExported={onChanged}
        />
      ) : null}
      {open === "settlement" ? (
        <SettlementImportDialog
          stores={stores}
          initialStoreId={storeId ?? null}
          onClose={close}
          onDone={onChanged}
        />
      ) : null}
    </div>
  );
}
