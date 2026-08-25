"use client";

import { formatMoney, formatQty } from "@/utils/decimal";
import type { PosReceipt } from "@/types/api";

/** The three papers a shop prints on. */
export type ReceiptSize = "58" | "80" | "a4";

function paidAtLabel(paidAt: string | null): string {
  if (!paidAt) return "";

  const at = new Date(paidAt);
  if (Number.isNaN(at.getTime())) return "";

  return at.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The receipt itself (FR-8).
 *
 * WHAT IS ON SCREEN IS WHAT PRINTS. There is no separate print template — the
 * stylesheet hides everything else on the page and sizes this one node. Two
 * templates would mean a receipt that looked right in the preview and wrong on
 * the roll, discovered by a customer.
 *
 * `tabular-nums`, NOT `font-mono` (ui-rules §5). There are two typefaces in this
 * product and mono is not one of them; Inter's tabular figures align a column of
 * amounts exactly as well, which is the only thing mono was doing here.
 *
 * A FIELD THE SHOP NEVER FILLED IN IS AN ABSENT LINE, not an empty one and never
 * the word "undefined". The server sends "" for those, and this renders nothing
 * rather than a blank row that looks like a printing fault.
 */
export function ReceiptPreview({
  receipt,
  size,
}: {
  receipt: PosReceipt;
  size: ReceiptSize;
}) {
  const { header, totals } = receipt;

  return (
    <div
      data-receipt-sheet={size}
      className="mx-auto w-full bg-surface p-4 text-sm text-foreground"
    >
      <div className="text-center">
        <p className="font-semibold">{header.tenantName}</p>
        {header.branchName && <p>{header.branchName}</p>}
        {header.address && <p className="text-xs">{header.address}</p>}
        {header.phone && (
          <p className="text-xs tabular-nums">{header.phone}</p>
        )}
      </div>

      <div className="mt-3 border-t border-dashed border-border pt-2 text-xs tabular-nums">
        <div className="flex justify-between">
          <span>{receipt.transactionNumber}</span>
          <span>{paidAtLabel(receipt.paidAt)}</span>
        </div>
        {receipt.customerName && (
          <div className="mt-0.5">{receipt.customerName}</div>
        )}
      </div>

      {/*
        A voided sale still prints — the void leaves both the sale and its
        reversal visible (FR-11), and somebody holding the original needs to be
        able to reprint it. Saying so on the paper is the point: a reprint that
        looked identical to a live sale would be a refund waiting to happen.
      */}
      {receipt.status === "void" && (
        <p className="mt-2 text-center font-semibold text-danger">
          — TRANSAKSI DIBATALKAN —
        </p>
      )}

      <ul className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
        {receipt.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0 flex-1">{item.name}</span>
              <span className="tabular-nums">
                {formatMoney(item.lineTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {formatQty(item.qty)} × {formatMoney(item.unitPrice)}
              </span>
              {item.discount && (
                <span className="tabular-nums">
                  −{formatMoney(item.discount.resolvedAmount)}
                </span>
              )}
            </div>
            {/* FR-8's sub-line: which animal, and who groomed it. */}
            {(item.petName || item.groomerName) && (
              <div className="text-xs text-muted">
                {[item.petName, item.groomerName].filter(Boolean).join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ul>

      {receipt.otherCharges.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {receipt.otherCharges.map((charge, index) => (
            <li key={`${charge.label}-${index}`} className="flex justify-between">
              <span>{charge.label}</span>
              <span className="tabular-nums">{formatMoney(charge.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {totals && (
        <dl className="mt-2 space-y-0.5 border-t border-dashed border-border pt-2 text-xs">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
          </div>
          {totals.itemDiscount !== "0.0000" && (
            <div className="flex justify-between">
              <dt>Diskon item</dt>
              <dd className="tabular-nums">
                −{formatMoney(totals.itemDiscount)}
              </dd>
            </div>
          )}
          {totals.cartDiscount !== "0.0000" && (
            <div className="flex justify-between">
              <dt>Diskon</dt>
              <dd className="tabular-nums">
                −{formatMoney(totals.cartDiscount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>DPP</dt>
            <dd className="tabular-nums">{formatMoney(totals.dpp)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>PPN</dt>
            <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(totals.grandTotal)}</dd>
          </div>
        </dl>
      )}

      <ul className="mt-2 space-y-0.5 border-t border-dashed border-border pt-2 text-xs">
        {receipt.payments.map((payment, index) => (
          <li key={`${payment.channelName}-${index}`}>
            <div className="flex justify-between">
              <span>{payment.channelName}</span>
              <span className="tabular-nums">{formatMoney(payment.amount)}</span>
            </div>
            {payment.change && payment.change !== "0.0000" && (
              <div className="flex justify-between text-muted">
                <span>Kembalian</span>
                <span className="tabular-nums">
                  {formatMoney(payment.change)}
                </span>
              </div>
            )}
            {payment.reference && (
              <div className="text-muted tabular-nums">
                Ref: {payment.reference}
              </div>
            )}
          </li>
        ))}
      </ul>

      {receipt.note && (
        <p className="mt-2 border-t border-dashed border-border pt-2 text-xs">
          {receipt.note}
        </p>
      )}

      <p className="mt-3 text-center text-xs text-muted">
        Terima kasih sudah mampir.
      </p>
    </div>
  );
}
