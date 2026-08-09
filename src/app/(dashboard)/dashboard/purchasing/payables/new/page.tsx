import type { Metadata } from "next";

import {
  FileInvoiceForm,
  PageHeading,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Catat faktur supplier · PawShip" };

/**
 * `create`, not `read`. Filing a bill is a write, and the seeded Staff role holds
 * it without `pay` — the separation of duties this module turns on.
 *
 * `?receipt=` is read here rather than by the form, matching the returns page:
 * the server already has the search params, so the client component does not
 * need `useSearchParams` and the Suspense boundary that comes with it.
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
          Utangnya sudah tercatat sejak barang diterima. Yang dicatat di sini
          adalah dokumen tagihannya — nomor faktur supplier dan tanggal
          terbitnya, yang menentukan jatuh tempo lewat termin supplier.
        </PageHeading>

        <FileInvoiceForm receiptId={receipt} />
      </div>
    </RequirePermission>
  );
}
