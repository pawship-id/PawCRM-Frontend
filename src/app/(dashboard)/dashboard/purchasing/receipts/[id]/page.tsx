import type { Metadata } from "next";

import { PageHeading, ReceiptDetail } from "@/features/purchasing";

export const metadata: Metadata = { title: "Detail penerimaan · PawShip" };

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        backHref="/dashboard/purchasing/receipts"
        backLabel="Penerimaan Barang"
        title="Detail penerimaan"
      />
      <ReceiptDetail receiptId={id} />
    </div>
  );
}
