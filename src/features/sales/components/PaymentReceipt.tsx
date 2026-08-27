"use client";

import { formatMoney } from "@/utils/decimal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
  Tenant,
} from "@/types/api";

const METHOD_LABEL: Record<CustomerInvoicePayment["method"], string> = {
  transfer: "Transfer bank",
  cash: "Tunai",
  qris: "QRIS",
  edc: "EDC / kartu",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * A KWITANSI — proof that one payment was received (PCR-032).
 *
 * ONE PAYMENT, NOT THE INVOICE. A receipt answers "we received this money from
 * you on this day", which is a fact about a single transfer; the invoice's own
 * totals appear only as context for what is still owed. Printing the invoice
 * instead would hand a customer who paid a third of a bill a document whose
 * headline number is the whole of it.
 *
 * A4 ONLY, and deliberately not the till's thermal widths. A kwitansi is filed,
 * attached to a transfer slip, or emailed to a B2B customer's finance desk —
 * none of which a 58 mm roll serves. It borrows `print/receipt.css` for the
 * page-isolation mechanics, which is where the two failures that produced that
 * stylesheet are written down.
 *
 * THE SHOP HEADER COMES FROM THE TENANT, not from a backend receipt endpoint.
 * The POS has one because a struk needs the cart, the cashier and a public
 * token; a kwitansi needs a name, an address and a payment the caller already
 * holds. A second endpoint would be a second place for the shop's own details
 * to go stale.
 *
 * NO LEDGER REFERENCE ON THE SHEET. It used to carry "dicetak dari … · jurnal
 * <ObjectId>", which was neither asked for by the PRD nor of any use to the
 * person holding it: a database id on a customer-facing document is noise, and
 * the journal it names is internal. The id stays where it belongs — on the
 * invoice's own payment timeline, which is a staff screen.
 *
 * A CANCELLED PAYMENT STILL PRINTS, marked. Somebody re-printing one is usually
 * doing so precisely because it was cancelled, and a document that silently
 * omitted that would be worse than no document.
 */
export function PaymentReceipt({
  invoice,
  payment,
  tenant,
  branchName,
}: {
  invoice: CustomerInvoiceDetail;
  payment: CustomerInvoicePayment;
  /** Null while the tenant read is in flight or failed — the header degrades. */
  tenant: Tenant | null;
  branchName: string | null;
}) {
  return (
    <div
      data-receipt-sheet="a4"
      className="mx-auto w-full bg-surface p-8 text-sm text-foreground"
    >
      <div className="flex items-start justify-between gap-6 border-b border-border pb-4">
        <div>
          <p className="text-base font-semibold">
            {tenant?.name ?? "—"}
          </p>
          {branchName && <p className="text-sm text-muted">{branchName}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">KWITANSI</p>
          <p className="text-xs text-muted">Bukti penerimaan pembayaran</p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        <Row label="Diterima dari">
          {invoice.customerName ?? "Pelanggan terhapus"}
        </Row>
        <Row label="Tanggal terima">
          <span className="tabular-nums">{formatDate(payment.at)}</span>
        </Row>
        <Row label="Untuk pembayaran faktur">
          <span className="tabular-nums">{invoice.invoiceNumber}</span>
        </Row>
        <Row label="Metode">
          {METHOD_LABEL[payment.method]}
          {payment.channelName ? ` — ${payment.channelName}` : ""}
        </Row>
        {payment.ref && (
          <Row label="No. referensi">
            <span className="tabular-nums">{payment.ref}</span>
          </Row>
        )}
        <Row label="Diterima oleh">{payment.byUserName ?? "—"}</Row>
      </dl>

      <div className="mt-6 flex items-baseline justify-between gap-6 rounded-md border border-border bg-surface-hover px-5 py-4">
        <span className="font-medium">Jumlah diterima</span>
        <span className="text-xl font-bold tabular-nums">
          {formatMoney(payment.amount)}
        </span>
      </div>

      {/*
        WHAT IS STILL OWED, on the same sheet. A customer paying an instalment
        asks this immediately, and a kwitansi that answers only "we got 400.000"
        sends them back to the counter to ask the other half.

        THESE ARE THE INVOICE'S FIGURES AS OF NOW, not as of the payment — the
        receipt is printed from the current document, so a later instalment moves
        them. That is the honest reading: the sheet says what is owed today.
      */}
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Row label="Total tagihan faktur">
          <span className="tabular-nums">{formatMoney(invoice.total)}</span>
        </Row>
        <Row label="Sisa tagihan saat ini">
          <span className="tabular-nums font-semibold">
            {formatMoney(invoice.outstandingAmount)}
          </span>
        </Row>
      </dl>

      {payment.isVoided && (
        <p className="mt-6 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger-ink">
          PEMBAYARAN INI DIBATALKAN
          {payment.voidReason ? ` — ${payment.voidReason}` : ""}. Kwitansi ini
          tidak berlaku.
        </p>
      )}

      <div className="mt-10 flex justify-end">
        <div className="w-56 text-center">
          <div className="h-16" />
          <div className="border-t border-border pt-2 text-xs text-muted">
            Tanda tangan &amp; stempel
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
