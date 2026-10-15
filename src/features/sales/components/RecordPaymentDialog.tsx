"use client";

import { RecordPaymentDialog as PaymentDialog } from "@/features/cash-transactions/components/RecordPaymentDialog";
import type { CustomerInvoiceDetail } from "@/types/api";

import { RecordPaymentForm } from "./RecordPaymentForm";

/**
 * TAKING MONEY, in a dialog rather than a card always on the screen — most
 * visits to an invoice are reads. The dialog and the form are shared with
 * Pembelian (cash-transactions/RecordPaymentDialog); this names the receivable.
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
    <PaymentDialog
      open={open}
      onOpenChange={onOpenChange}
      description="Satu mekanisme untuk DP, cicilan, dan pelunasan — tidak ada tab Piutang, karena faktur ini sendiri piutangnya."
      summaryLabel="Sisa tagihan saat ini"
      summaryAmount={invoice.outstandingAmount}
      summaryCaption={`${invoice.invoiceNumber} · ${invoice.customerName ?? "Pelanggan terhapus"}`}
    >
      <RecordPaymentForm
        key={open ? "open" : "closed"}
        invoice={invoice}
        onPaid={(updated) => {
          onPaid(updated);
          onOpenChange(false);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </PaymentDialog>
  );
}
