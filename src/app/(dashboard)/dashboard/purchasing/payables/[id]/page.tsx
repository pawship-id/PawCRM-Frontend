import type { Metadata } from "next";

import { InvoiceDetail } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail faktur · Buloo" };

/**
 * One supplier invoice. The heading is drawn by `InvoiceDetail` itself — its
 * title is the invoice NUMBER, which only the loaded document knows (15 October
 * 2026, matching the sales invoice page).
 */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="purchaseInvoices" action="read">
      <InvoiceDetail invoiceId={id} />
    </RequirePermission>
  );
}
