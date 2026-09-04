"use client";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/utils/decimal";
import type { PurchaseInvoicePayment } from "@/types/api";

const METHOD_LABEL: Record<PurchaseInvoicePayment["method"], string> = {
  transfer: "transfer",
  cash: "tunai",
  qris: "QRIS",
  giro: "giro",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every payment made against one invoice, newest last.
 *
 * IN THE ORDER THEY WERE MADE, deliberately — this is a running account of how a
 * bill was settled, and instalments read as a sequence. Reversing it to
 * newest-first would put the final payment above the ones that led to it.
 *
 * EACH ROW CARRIES ITS JOURNAL ENTRY ID, and it is not decoration. A payment
 * cannot be edited or deleted — the entry it posted is immutable — so that id is
 * the only handle anyone has on a mistake: correcting one means reversing that
 * entry in the ledger. It is shown rather than linked because the accounting
 * screens still run on mock data; a link from a real payment to a fabricated
 * entry would be worse than no link at all.
 *
 * WHAT THE FOOTNOTE IS CAREFUL NOT TO PROMISE: reversing the entry corrects the
 * BOOKS, not this document. Nothing on the backend restores `paidAmount` or
 * `status` when an entry is reversed, so an invoice whose payment was reversed
 * still reads as paid here. Saying "batalkan pembayaran" would be a lie about
 * what the available action does.
 */
export function PaymentHistory({
  payments,
}: {
  payments: PurchaseInvoicePayment[];
}) {
  return (
    <Card title="Riwayat pembayaran">
      {payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Belum ada pembayaran untuk faktur ini.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments.map((payment) => (
            <li
              key={payment.paymentId}
              className="flex flex-col gap-1 border-l-2 border-primary pl-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <b className="tabular-nums">
                  {formatMoney(payment.amount)}
                </b>
                <Badge variant="outline">{METHOD_LABEL[payment.method]}</Badge>
                <span className="text-xs text-muted">
                  {formatDate(payment.at)}
                  {payment.ref && ` · ${payment.ref}`}
                </span>
              </div>
              <p className="text-[11px] text-muted">
                {payment.byUserName ?? "Pengguna terhapus"} · jurnal{" "}
                <span className="tabular-nums">{payment.journalEntryId}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {payments.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Pembayaran tidak bisa dihapus atau diedit. Kalau ada yang salah,
          koreksinya adalah <b>membalik jurnal</b> pembayaran tersebut di modul
          Keuangan — itu memperbaiki pembukuan, tapi angka <i>dibayar</i> pada
          faktur ini tetap seperti yang tercatat.
        </p>
      )}
    </Card>
  );
}
