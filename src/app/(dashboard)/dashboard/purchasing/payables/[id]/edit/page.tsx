import type { Metadata } from "next";

import {
  EditInvoiceScreen,
  PageHeading,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah faktur · Buloo" };

/**
 * Editing a MANUAL invoice that no goods receipt has been made from yet.
 * Gated by `create` — the same grant the edit endpoint checks.
 */
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="purchaseInvoices" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.payables,
            { label: "Detail faktur", href: `/dashboard/purchasing/payables/${id}` },
            { label: "Ubah" },
          ]}
          title="Ubah faktur"
        />
        <EditInvoiceScreen invoiceId={id} />
      </div>
    </RequirePermission>
  );
}
