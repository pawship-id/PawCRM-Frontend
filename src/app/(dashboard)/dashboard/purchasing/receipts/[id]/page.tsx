import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  ReceiptDetail,
} from "@/features/purchasing";

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
        crumbs={[
          PURCHASING_CRUMBS.hub,
          PURCHASING_CRUMBS.receipts,
          { label: "Detail penerimaan" },
        ]}
        title="Detail penerimaan"
      />
      <ReceiptDetail receiptId={id} />
    </div>
  );
}
