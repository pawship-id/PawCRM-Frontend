import type { Metadata } from "next";

import { PageHeading, PurchaseReturnForm } from "@/features/purchasing";

export const metadata: Metadata = { title: "Buat retur · PawShip" };

export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        backHref="/dashboard/purchasing/returns"
        backLabel="Retur ke Supplier"
        title="Buat retur"
      >
        HPP dibalik memakai harga beli asli dari penerimaannya, bukan HPP yang
        berlaku hari ini. Utang ke supplier ikut berkurang otomatis.
      </PageHeading>

      <PurchaseReturnForm receiptId={receipt} />
    </div>
  );
}
