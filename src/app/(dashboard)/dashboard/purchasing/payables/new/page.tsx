import type { Metadata } from "next";
import Link from "next/link";

import {
  FileInvoiceForm,
  ManualInvoiceForm,
  PageHeading,
  PURCHASING_CRUMBS,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Catat faktur supplier · Buloo" };

/**
 * TWO WAYS IN (14 October 2026, BO):
 *
 *   manual (default)         — the bill arrives before the goods: supplier,
 *                              gudang and lines typed in; the goods receipt is
 *                              made from it later.
 *   `?receipt=` / `?mode=receipt` — bill a delivery already filed; its lines
 *                              are copied.
 *
 * `create`, not `read`: filing a bill is a write.
 */
export default async function FileInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string; mode?: string }>;
}) {
  const { receipt, mode } = await searchParams;
  const fromReceipt = Boolean(receipt) || mode === "receipt";

  return (
    <RequirePermission feature="purchaseInvoices" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.payables,
            { label: "Catat faktur" },
          ]}
          title={
            fromReceipt
              ? "Catat faktur dari penerimaan"
              : "Catat faktur supplier"
          }
        >
          {fromReceipt ? (
            <>
              Barang dan nilainya disalin dari penerimaan yang dipilih.{" "}
              <Link
                href="/dashboard/purchasing/payables/new"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Atau catat faktur manual →
              </Link>
            </>
          ) : (
            <>
              Faktur yang datang sebelum barangnya. Penerimaan barang dibuat dari
              faktur ini saat barang tiba.{" "}
              <Link
                href="/dashboard/purchasing/payables/new?mode=receipt"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Barangnya sudah dicatat di penerimaan? Buat faktur dari penerimaan →
              </Link>
            </>
          )}
        </PageHeading>

        {fromReceipt ? (
          <FileInvoiceForm receiptId={receipt} />
        ) : (
          <ManualInvoiceForm />
        )}
      </div>
    </RequirePermission>
  );
}
