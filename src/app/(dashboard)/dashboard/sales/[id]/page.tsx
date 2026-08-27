import type { Metadata } from "next";

import { InvoiceDetail } from "@/features/sales";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail Faktur · Buloo" };

/**
 * `params` IS A PROMISE in this version of Next — see AGENTS.md. Awaited here
 * rather than in the client component, which cannot be async.
 *
 * Gated on `read` rather than `pay`: looking at one invoice is the same right as
 * looking at the list. The payment FORM inside carries its own `pay` gate, so a
 * role with read-only access sees the whole picture and no way to move money.
 */
export default async function SalesInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="customerInvoices" action="read">
      <InvoiceDetail invoiceId={id} />
    </RequirePermission>
  );
}
