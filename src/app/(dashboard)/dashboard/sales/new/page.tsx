import type { Metadata } from "next";

import { InvoiceCreateForm } from "@/features/sales";
// Not from `@/components` — `PageHeading` is still a purchasing-local
// component awaiting promotion (ui-rules §15). The sales list imports it from
// the same place; a second copy is what that migration list exists to prevent.
import { PageHeading } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";
import { INVOICES_CRUMBS } from "@/features/sales/crumbs";

export const metadata: Metadata = { title: "Faktur Baru · Buloo" };

/**
 * Raising an invoice by hand — PCR-030.
 *
 * GATED ON `create`, NOT `read`. Issuing one cuts stock, posts two journal
 * entries and consumes a number from the branch's series; a role that may read
 * the collection list has no business doing any of that.
 *
 * DECLARED BEFORE `[id]` in the filesystem, but Next matches static segments
 * ahead of dynamic ones regardless, so "new" is never read as an invoice id.
 */
export default function NewSalesInvoicePage() {
  return (
    <RequirePermission feature="customerInvoices" action="create">
      {/* BARE TEXT, not a <p>. `PageHeading` already wraps its children in one,
          and nesting a second produces invalid HTML that React reports as a
          hydration error. The sales list passes plain text for the same reason. */}
      <PageHeading crumbs={INVOICES_CRUMBS} title="Faktur baru">
        Tagihan yang dibuat sendiri, bukan dari kasir. Menerbitkannya memotong
        stok dan mencatat jurnal — dan tidak bisa diubah setelahnya.
      </PageHeading>
      <InvoiceCreateForm />
    </RequirePermission>
  );
}
