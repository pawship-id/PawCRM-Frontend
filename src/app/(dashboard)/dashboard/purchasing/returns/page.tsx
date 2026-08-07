import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumb } from "@/components";
import { Button } from "@/components/ui/button";
import {
  PURCHASING_CRUMBS,
  PurchaseReturnsScreen,
} from "@/features/purchasing";

export const metadata: Metadata = { title: "Retur ke Supplier · PawShip" };

export default function PurchaseReturnsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Breadcrumb
            items={[PURCHASING_CRUMBS.hub, { label: "Retur ke Supplier" }]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Retur ke Supplier
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Retur selalu ditarik dari penerimaan aslinya, sehingga harga beli
            asli ikut terbawa — itulah yang membuat perhitungan HPP tetap benar
            setelah barang dikembalikan.
          </p>
        </div>
        <Button asChild className="ml-auto">
          <Link href="/dashboard/purchasing/returns/new">+ Buat retur</Link>
        </Button>
      </div>

      <PurchaseReturnsScreen />
    </div>
  );
}
