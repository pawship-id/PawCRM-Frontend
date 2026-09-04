"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
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
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
} from "@/types/api";

import { PaymentReceipt } from "./PaymentReceipt";
// The page-isolation mechanics, shared with the till's struk. That stylesheet
// carries the two ways printing from inside a dialog went wrong before it.
import "@/features/pos/print/receipt.css";

/**
 * Preview one payment's kwitansi, and print it (PCR-032).
 *
 * THE COPY THAT PRINTS IS NOT THE ONE ON SCREEN — the same arrangement
 * `ReceiptDialog` uses, and for the same reason. Setting `printing` renders a
 * second sheet into a node attached straight to `document.body`, and
 * `print/receipt.css` removes everything else on the page. Printing from inside
 * the dialog anchors the sheet to the middle of a transformed, fixed-position
 * ancestor, which put the receipt half a page down with its right-hand column
 * running off the paper.
 *
 * `flushSync` IS LOAD-BEARING. `window.print()` runs synchronously against
 * whatever is in the DOM at that instant; an ordinary `setState` would still be
 * queued and the page would print with no receipt on it at all.
 *
 * NO "UNDUH PDF" BUTTON. Every browser's print dialog already offers Save as
 * PDF, and the filename it proposes is `document.title` — which is why the title
 * is swapped for the length of the print and put back afterwards.
 */
export function PaymentReceiptDialog({
  invoice,
  payment,
  onClose,
}: {
  invoice: CustomerInvoiceDetail;
  /** The payment to print, or null when the dialog is closed. */
  payment: CustomerInvoicePayment | null;
  onClose: () => void;
}) {
  const { tenant } = useTenant();
  const [printing, setPrinting] = useState(false);

  function print() {
    if (!payment) return;

    const previousTitle = document.title;

    flushSync(() => setPrinting(true));
    document.title = `Kwitansi ${invoice.invoiceNumber}`;

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
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kwitansi pembayaran</DialogTitle>
          <DialogDescription>
            Bukti penerimaan untuk satu pembayaran — bukan untuk seluruh faktur.
          </DialogDescription>
        </DialogHeader>

        {payment && (
          <div className="rounded-lg border border-border">
            <PaymentReceipt
              invoice={invoice}
              payment={payment}
              tenant={tenant}
              branchName={invoice.branchName}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button type="button" onClick={print} disabled={!payment}>
            <Printer className="size-4" />
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>

      {/*
        WHAT ACTUALLY PRINTS. A direct child of `body`, so nothing positioned,
        transformed or scrolling sits between it and the paper.

        Present only while printing: a second copy of the receipt in the DOM the
        rest of the time would be read out by a screen reader as a second
        kwitansi.
      */}
      {printing && payment
        ? createPortal(
            <div data-print-root>
              <PaymentReceipt
                invoice={invoice}
                payment={payment}
                tenant={tenant}
                branchName={invoice.branchName}
              />
            </div>,
            document.body,
          )
        : null}
    </Dialog>
  );
}
