"use client";

import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant } from "@/features/tenant";
import type { CustomerInvoiceDetail } from "@/types/api";

import { InvoiceSheet } from "./InvoiceSheet";
// The page-isolation mechanics, shared with the till's struk and the kwitansi.
// That stylesheet carries the two ways printing from inside a dialog went wrong.
import "@/features/pos/print/receipt.css";

/**
 * Preview the invoice on A4, and print it.
 *
 * THE MECHANICS ARE `PaymentReceiptDialog`'S, deliberately unchanged — the same
 * portal, the same `flushSync`, the same title swap. Both print an A4 sheet from
 * inside a Radix dialog, and the two failures that shaped that arrangement are
 * written down in `print/receipt.css`. A second, subtly different version of it
 * would rediscover them.
 *
 * IN SHORT: the copy that prints is NOT the one on screen. Printing from inside
 * the dialog anchors the sheet to a transformed, fixed-position ancestor, which
 * put it half a page down with its right column off the paper. `flushSync` is
 * load-bearing because `window.print()` runs synchronously against whatever is
 * in the DOM at that instant.
 *
 * NO "UNDUH PDF" BUTTON. Every browser's print dialog already offers Save as
 * PDF, and the filename it proposes is `document.title` — which is why the title
 * becomes the invoice number for the length of the print and is put back after.
 */
export function InvoicePrintDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: CustomerInvoiceDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { tenant } = useTenant();
  const [printing, setPrinting] = useState(false);

  function print() {
    const previousTitle = document.title;

    flushSync(() => setPrinting(true));
    document.title = `Faktur ${invoice.invoiceNumber}`;

    /*
      `afterprint` rather than the line after `print()`. Chrome blocks until the
      dialog closes, but Safari does not — restoring unconditionally there would
      tear the sheet back out of the page while the dialog was still open.
    */
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
        setPrinting(false);
      },
      { once: true },
    );

    window.print();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cetak faktur</DialogTitle>
          <DialogDescription>
            Salinan untuk pelanggan — seluruh tagihan, bukan satu pembayaran.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border">
          <InvoiceSheet invoice={invoice} tenant={tenant} />
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button type="button" onClick={print}>
            <Printer className="size-4" />
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>

      {/*
        WHAT ACTUALLY PRINTS. A direct child of `body`, so nothing positioned,
        transformed or scrolling sits between it and the paper.

        Present only while printing: a second copy in the DOM the rest of the
        time would be read out by a screen reader as a second invoice.
      */}
      {printing
        ? createPortal(
            <div data-print-root>
              <InvoiceSheet invoice={invoice} tenant={tenant} />
            </div>,
            document.body,
          )
        : null}
    </Dialog>
  );
}
