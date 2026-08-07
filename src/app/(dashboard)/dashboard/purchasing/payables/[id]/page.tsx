import type { Metadata } from "next";

import {
  InvoiceDetail,
  PageHeading,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";

export const metadata: Metadata = { title: "Detail faktur · PawShip" };

export default async function InvoiceDetailPage({
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
          PURCHASING_CRUMBS.payables,
          { label: "Detail faktur" },
        ]}
        title="Detail faktur"
      >
        Pembayaran boleh dicicil beberapa kali. Akun kas menyesuaikan metodenya.
      </PageHeading>
      <InvoiceDetail invoiceId={id} />
    </div>
  );
}
