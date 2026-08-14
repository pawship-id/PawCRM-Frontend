import type { Metadata } from "next";

import {
  InvoiceDetail,
  PageHeading,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail faktur · Buloo" };

/**
 * Guarded on `read`, not `pay`. Seeing what is owed and recording money leaving
 * are different privileges — the payment form inside gates itself on `pay`, so a
 * role that may file bills but not settle them gets the whole picture and no way
 * to move cash.
 */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="purchaseInvoices" action="read">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.payables,
            { label: "Detail faktur" },
          ]}
          title="Detail faktur"
        >
          Pembayaran boleh dicicil beberapa kali sampai lunas. Akun kas
          menyesuaikan metodenya, dan setiap pembayaran memposting jurnalnya
          sendiri.
        </PageHeading>
        <InvoiceDetail invoiceId={id} />
      </div>
    </RequirePermission>
  );
}
