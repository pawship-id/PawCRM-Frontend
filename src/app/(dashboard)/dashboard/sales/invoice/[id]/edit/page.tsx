import type { Metadata } from "next";

import { InvoiceEditScreen } from "@/features/sales";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah faktur · Buloo" };

/**
 * Editing a manual faktur that nothing has been paid on yet — its own page
 * since 26 October 2026, like Ubah faktur on Pembelian. Gated by `update`, the
 * grant the edit endpoint checks; the screen re-checks the paid / till-born
 * lock once the invoice is loaded.
 */
export default async function EditSalesInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="customerInvoices" action="update">
      <InvoiceEditScreen invoiceId={id} />
    </RequirePermission>
  );
}
