import type { Metadata } from "next";

import {
  PageHeading,
  PurchaseInvoiceForm,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Catat faktur supplier · Buloo" };

/**
 * ONE PAGE (16 October 2026, BO). The supplier is picked first; if it has
 * deliveries still waiting for a bill, the form offers them, otherwise the
 * bill is typed in as a manual invoice. The two-mode header links are gone.
 *
 * `?receipt=` — from a receipt's "Catat faktur supplier" — opens the form on
 * that receipt and its supplier.
 *
 * `create`, not `read`: filing a bill is a write.
 */
export default async function FileInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;

  return (
    <RequirePermission feature="purchaseInvoices" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.payables,
            { label: "Catat faktur" },
          ]}
          title="Catat faktur supplier"
        >
          Pilih supplier dulu. Kalau barangnya sudah diterima, faktur dibuat
          dari penerimaannya; kalau belum, catat sebagai faktur manual.
        </PageHeading>

        <PurchaseInvoiceForm receiptId={receipt} />
      </div>
    </RequirePermission>
  );
}
