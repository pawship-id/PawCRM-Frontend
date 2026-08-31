import type { Metadata } from "next";

import { InvoicePrintScreen } from "@/features/sales";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Cetak Faktur · Buloo" };

/**
 * A PAGE OF ITS OWN, not a dialog — `Layout/07e-invoice-print.html`.
 *
 * WHY IT MATTERS THAT IT HAS A URL. Printing is a task somebody comes back to:
 * the printer was out of paper, the customer asked for another copy, somebody
 * else has to send it. A dialog cannot be linked to, opened in a second tab, or
 * reached from a chat message — and it forces the person to find the invoice
 * again before they can find the button.
 *
 * `params` IS A PROMISE in this version of Next — see AGENTS.md.
 *
 * GATED ON `read`, the same right as looking at the invoice: the sheet shows
 * nothing the detail screen does not. A separate grant would be a permission
 * that protects a screenshot.
 */
export default async function SalesInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="customerInvoices" action="read">
      <InvoicePrintScreen invoiceId={id} />
    </RequirePermission>
  );
}
