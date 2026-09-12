"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { PublicCustomerInvoice } from "@/types/api";

import { InvoiceSheet } from "./InvoiceSheet";
// The page-isolation mechanics, shared with the till's struk and Cetak Faktur.
import "@/features/pos/print/receipt.css";

/**
 * The faktur as its customer sees it — /faktur/:token, from a WhatsApp message.
 *
 * THE SAME SHEET THE SHOP PRINTS, not a second rendering of the bill. A customer
 * comparing the link on their phone with the paper in their hand must not find
 * two documents; `InvoiceSheet` decides what goes on a faktur, once.
 *
 * A4 ON A WIDE SCREEN, THE ROLL LAYOUT ON A PHONE. The A4 sheet is a five-column
 * table, and at a phone's width it squeezes the amounts — the column a customer
 * opened this for. The thermal layout stacks each line and was drawn for exactly
 * this narrow. Wide is the fallback, so the server never prerenders the narrow
 * branch for a desktop.
 *
 * A DOCUMENT, NOT A SCREEN. No session, no permission, nothing to act on — so
 * nothing here offers one. A voided faktur still opens: the sheet itself says,
 * first and unmissably, that it was cancelled.
 *
 * NOTHING DISTINGUISHES "no such faktur" FROM ANY OTHER FAILURE, matching the
 * server's single 404: telling somebody their guess named a real invoice is more
 * than an anonymous caller should learn.
 */
export function PublicInvoiceScreen({ token }: { token: string }) {
  const [invoice, setInvoice] = useState<PublicCustomerInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const wide = useMediaQuery("(min-width: 640px)", true);

  useEffect(() => {
    let active = true;

    customerInvoiceService
      .publicInvoice(token)
      .then((result) => {
        if (active) setInvoice(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    /*
      `data-print-root` because a customer may well print or save their own
      faktur, and `print/receipt.css` removes every top-level node that is not
      one. No button for it — the browser's own print is what they reach for.
    */
    <main
      data-print-root
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat faktur…
        </div>
      )}

      {failed && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-bold">Faktur ini tidak ditemukan.</h1>
          <p className="mt-1 text-sm text-muted">
            Tautannya mungkin salah ketik atau sudah tidak berlaku. Minta lagi
            ke petshop-nya, ya.
          </p>
        </div>
      )}

      {invoice && (
        <>
          <div
            data-receipt-frame
            className="overflow-hidden rounded-xl border border-border shadow-sm"
          >
            <InvoiceSheet
              invoice={invoice}
              tenant={{
                name: invoice.tenant.name,
                settings: invoice.tenant.invoiceFooterNote
                  ? { invoiceFooterNote: invoice.tenant.invoiceFooterNote }
                  : {},
              }}
              size={wide ? "a4" : "80"}
            />
          </div>

          {/* Advice about a link, which means nothing once this is on paper. */}
          <p data-screen-only className="text-center text-sm text-muted">
            Faktur ini dikirim oleh {invoice.tenant.name}. Simpan tautannya kalau
            sewaktu-waktu perlu dibuka lagi.
          </p>
        </>
      )}
    </main>
  );
}
