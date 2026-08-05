import type { Metadata } from "next";

import { InvoiceDetail, PageHeading } from "@/features/purchasing";

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
        backHref="/dashboard/purchasing/payables"
        backLabel="Utang Supplier"
        title="Detail faktur"
      >
        Pembayaran boleh dicicil beberapa kali. Akun kas menyesuaikan metodenya.
      </PageHeading>
      <InvoiceDetail invoiceId={id} />
    </div>
  );
}
