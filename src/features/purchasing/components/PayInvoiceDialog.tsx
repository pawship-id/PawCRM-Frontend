"use client";

import {
  PaymentForm,
  RecordPaymentDialog,
} from "@/features/cash-transactions/components/RecordPaymentDialog";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney, toMinor } from "@/utils/decimal";
import type { PurchaseInvoiceDetail } from "@/types/api";

/**
 * PAYING A SUPPLIER BILL, in a dialog — shared by the invoice's own page and the
 * Faktur Pembelian list (16 October 2026), the way a sales invoice's dialog is
 * shared by its page and its list. The ceiling is `payableAmount`: a bill can
 * be paid only as far as its goods have arrived.
 */
export function PayInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onPaid,
}: {
  invoice: PurchaseInvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (updated: PurchaseInvoiceDetail) => void;
}) {
  return (
    <RecordPaymentDialog
      open={open}
      onOpenChange={onOpenChange}
      description="Untuk DP, cicilan, dan pelunasan ke supplier. Yang bisa dibayar hanya barang yang sudah diterima."
      summaryLabel="Bisa dibayar sekarang"
      summaryAmount={invoice.payableAmount}
      summaryCaption={`${invoice.invoiceNumber} · ${invoice.supplierName ?? "Supplier terhapus"} · sisa tagihan ${formatMoney(invoice.outstandingAmount)}`}
    >
      <PaymentForm
        key={open ? "open" : "closed"}
        direction="out"
        ceiling={invoice.payableAmount}
        overCeilingMessage={
          (toMinor(invoice.payableAmount) ?? 0n) <
          (toMinor(invoice.outstandingAmount) ?? 0n)
            ? `Jumlah melebihi nilai barang yang sudah diterima dan belum dibayar (${formatMoney(invoice.payableAmount)}).`
            : `Jumlah melebihi sisa tagihan ${formatMoney(invoice.outstandingAmount)}.`
        }
        onCancel={() => onOpenChange(false)}
        onSubmit={async (input) => {
          const next = await purchaseInvoiceService.recordPayment(
            invoice._id,
            input,
          );
          onPaid(next);
          onOpenChange(false);
        }}
      />
    </RecordPaymentDialog>
  );
}
