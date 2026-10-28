"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Card } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { MarketplaceStore } from "@/types/marketplace";

import { ConnectStoreDialog } from "./ConnectStoreDialog";

/** What a sub-tab shows before the tenant has connected any store. */
export function NoStoresCard({ onCreated }: { onCreated: (store: MarketplaceStore) => void }) {
  const [connecting, setConnecting] = useState(false);

  return (
    <Card>
      <div className="flex flex-col items-start gap-3">
        <p className="text-base font-semibold text-foreground">Belum ada toko Shopee yang terhubung.</p>
        <p className="max-w-prose text-sm text-muted">
          Hubungkan toko, upload template Info Penjualan dari Seller Center, lalu ikat SKU-nya.
          Setelah itu stok Buloo bisa diekspor ke Shopee.
        </p>
        <Can feature="ecommerce" action="manageStores">
          <Button type="button" onClick={() => setConnecting(true)}>
            <Plus className="size-4" aria-hidden />
            Hubungkan toko
          </Button>
        </Can>
      </div>

      {connecting ? (
        <ConnectStoreDialog
          onClose={() => setConnecting(false)}
          onCreated={(store) => {
            setConnecting(false);
            onCreated(store);
          }}
        />
      ) : null}
    </Card>
  );
}
