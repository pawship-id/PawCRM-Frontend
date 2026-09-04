"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoiceDetail } from "@/types/api";

import { RecordPaymentForm } from "./RecordPaymentForm";

/**
 * TAKING MONEY, in a dialog rather than a card that is always on the screen.
 *
 * WHY IT MOVED. The form used to sit open on the detail screen for every unpaid
 * invoice, which put a form in front of everybody who came to READ one — and
 * most visits are reads. Behind a button it is one click away for the person who
 * came to record a payment and out of the way for everybody else.
 *
 * THE FIGURE IT IS ABOUT, at the top and unmissable. Somebody who clicked
 * "Catat pembayaran" from a list of cards needs to see WHICH invoice and HOW
 * MUCH is left before they type an amount — the dialog covers the page that
 * would otherwise have told them.
 *
 * `key` ON THE FORM, so a dialog closed halfway through and reopened starts
 * clean. Without it the amount somebody typed and abandoned would still be there
 * next time, and the most likely next action is to press Simpan.
 *
 * NOTHING ABOUT THE PAYMENT ITSELF CHANGED — the same form, the same
 * validation, the same request. This is where it lives, not what it does.
 */
export function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
  onPaid,
}: {
  invoice: CustomerInvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (updated: CustomerInvoiceDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>
            Satu mekanisme untuk DP, cicilan, dan pelunasan — tidak ada tab
            Piutang, karena faktur ini sendiri piutangnya.
          </DialogDescription>
        </DialogHeader>

        {/*
          WHICH INVOICE, AND WHAT IS LEFT. On a dark panel because it is the one
          thing that must be read before an amount is typed, and the dialog is
          covering the screen that would otherwise have said it.
        */}
        <div className="rounded-xl bg-primary px-4 py-3.5 text-primary-foreground">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm opacity-80">Sisa tagihan saat ini</span>
            <span className="text-xl font-bold tabular-nums">
              {formatMoney(invoice.outstandingAmount)}
            </span>
          </div>
          <p className="mt-1 text-sm opacity-80 tabular-nums">
            {invoice.invoiceNumber} · {invoice.customerName ?? "Pelanggan terhapus"}
          </p>
        </div>

        <RecordPaymentForm
          key={open ? "open" : "closed"}
          invoice={invoice}
          onPaid={(updated) => {
            onPaid(updated);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
