"use client";

import { Alert } from "@/components";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { PaymentForm } from "@/features/cash-transactions/components/RecordPaymentDialog";
import type { CustomerInvoiceDetail } from "@/types/api";

/**
 * Record money arriving against one receivable — DP, cicilan and pelunasan
 * alike (PCR-032). The form itself is the shared `PaymentForm` (moved to
 * cash-transactions on 15 October 2026 when Pembelian adopted it); this wraps
 * it with the receivable's ceiling, its request, and its note.
 */
export function RecordPaymentForm({
  invoice,
  onPaid,
  onCancel,
}: {
  invoice: CustomerInvoiceDetail;
  /** Handed the UPDATED invoice the write returned — no refetch needed. */
  onPaid: (updated: CustomerInvoiceDetail) => void;
  /** Offered when the form is in a dialog. */
  onCancel?: () => void;
}) {
  return (
    <PaymentForm
      direction="in"
      ceiling={invoice.outstandingAmount}
      onCancel={onCancel}
      onSubmit={async (input) => {
        const updated = await customerInvoiceService.recordPayment(
          invoice._id,
          input,
        );
        onPaid(updated);
      }}
      note={
        <Alert variant="info">
          Jumlah tidak boleh melebihi sisa tagihan. Setelah disimpan, status
          faktur naik sendiri ke <strong>DP sebagian</strong> atau{" "}
          <strong>Lunas</strong> — tidak ada aksi manual terpisah.
        </Alert>
      }
    />
  );
}
