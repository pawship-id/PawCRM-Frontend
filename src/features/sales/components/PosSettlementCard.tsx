"use client";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoiceDetail } from "@/types/api";

/** What a channel is, in the words a cashier uses. Falls back to its own type. */
const CHANNEL_LABEL: Record<string, string> = {
  cash: "tunai",
  transfer: "transfer",
  qris: "QRIS",
  edc: "EDC",
  ewallet: "e-wallet",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * HOW THE COUNTER SETTLED THE SALE — the till's own payment lines, read-only.
 *
 * ITS OWN CARD RATHER THAN ROWS IN "Riwayat pembayaran", and the separation is
 * load-bearing rather than cosmetic. That list means "money collected against
 * this debt, each with its own reversible journal entry", and every row there
 * carries a Batalkan button. A till sale's settlement was posted INSIDE the
 * sale's single revenue entry: there is no per-line entry to reverse, so a
 * Batalkan there would offer to undo something that does not exist — and the row
 * would also make the sale unvoidable, because a sale whose invoice has taken a
 * payment cannot be voided. The way to undo this money is Void or Retur at the
 * till, which is what the footnote says.
 *
 * NO CANCEL, NO PRINT. The receipt for this money is the sale's own struk, not a
 * kwitansi raised here.
 *
 * THE CHANNEL'S NAME IS THE SALE'S SNAPSHOT, not a lookup: FR-7 requires a
 * retired channel's history to stay readable as it was, so a bank renamed since
 * still prints the name the customer was given.
 *
 * CASH SHOWS THE CHANGE. "Rp 620.000 tunai" against a Rp 610.000 bill reads as an
 * overcharge until the 10.000 handed back is beside it.
 */
export function PosSettlementCard({
  settlement,
}: {
  settlement: NonNullable<CustomerInvoiceDetail["posSettlement"]>;
}) {
  return (
    <Card
      title="Pembayaran di kasir"
      description={
        settlement.transactionNumber
          ? `Transaksi ${settlement.transactionNumber}`
          : undefined
      }
    >
      {settlement.payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Transaksi kasir ini tidak mencatat pembayaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {settlement.payments.map((payment, index) => (
            <li
              key={`${payment.channelId ?? payment.channelName}-${index}`}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 border-l-2 border-success pl-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <b className="tabular-nums">{formatMoney(payment.amount)}</b>
                  <Badge variant="outline">
                    {CHANNEL_LABEL[payment.channelType] ?? payment.channelType}
                  </Badge>
                  {settlement.paidAt && (
                    <span className="text-xs text-muted">
                      {formatDateTime(settlement.paidAt)}
                      {payment.reference && ` · ${payment.reference}`}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted">
                  Masuk ke {payment.channelName}
                  {/* Cash only, and only when more was handed over than the bill. */}
                  {payment.change && payment.change !== "0.0000" && (
                    <> · kembalian {formatMoney(payment.change)}</>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        WHERE THIS MONEY CAN BE UNDONE, said once. Somebody looking for a cancel
        button on these rows needs to be sent to the till rather than left
        wondering why there is none.
      */}
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
        Uang ini diterima di kasir dan sudah masuk jurnal penjualannya. Untuk
        membatalkannya, gunakan Void atau Retur di halaman kasir — bukan dari
        faktur ini.
      </p>
    </Card>
  );
}
