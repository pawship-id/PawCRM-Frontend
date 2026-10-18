"use client";

import Link from "next/link";

import { Alert, Spinner } from "@/components";

import { usePurchaseInvoice } from "../hooks/usePurchaseInvoice";
import { PurchaseInvoiceForm } from "./PurchaseInvoiceForm";

/**
 * Loads a manual invoice and hands it to the form — or says why it cannot be
 * edited: once a goods receipt is made from it, its lines are the receipt's.
 */
export function EditInvoiceScreen({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound } = usePurchaseInvoice(invoiceId);

  if (loading && !invoice) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat faktur…
      </div>
    );
  }

  if (notFound) {
    return <Alert variant="error">Faktur tidak ditemukan.</Alert>;
  }

  if (error || !invoice) {
    return <Alert variant="error">{error ?? "Gagal memuat faktur."}</Alert>;
  }

  if (invoice.locked) {
    return (
      <Alert variant="info">
        Faktur {invoice.invoiceNumber} sudah punya penerimaan barang, jadi
        barangnya tidak bisa diubah lagi.{" "}
        <Link
          href={`/dashboard/purchasing/payables/${invoice._id}`}
          className="font-semibold underline"
        >
          Kembali ke faktur
        </Link>
      </Alert>
    );
  }

  return <PurchaseInvoiceForm invoice={invoice} />;
}
