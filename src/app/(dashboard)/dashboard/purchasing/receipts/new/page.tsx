import type { Metadata } from "next";

import { PageHeading, ReceiptForm } from "@/features/purchasing";

export const metadata: Metadata = { title: "Terima barang · PawShip" };

/**
 * `searchParams` is a Promise in this version of Next, like `params`. The
 * supplier can be pre-selected when arriving from a supplier's detail page.
 */
export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        backHref="/dashboard/purchasing/receipts"
        backLabel="Penerimaan Barang"
        title="Terima barang"
      >
        Penerimaan inilah yang membentuk HPP. Cocokkan harga beli dengan faktur
        supplier di tangan — angka yang keluar dipakai setiap penjualan
        berikutnya.
      </PageHeading>

      <ReceiptForm supplierId={supplier} />
    </div>
  );
}
