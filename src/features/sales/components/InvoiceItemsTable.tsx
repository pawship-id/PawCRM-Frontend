import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { CustomerInvoiceDetail } from "@/types/api";

/**
 * WHAT WAS BILLED — the lines, and the arithmetic that turned them into a total.
 *
 * EMPTY ON EVERY TILL-BORN INVOICE, and that absence is a fact rather than a
 * gap. Those lines live on the POS transaction that raised the invoice; copying
 * them here would be two records of one basket, free to disagree. So this says
 * so plainly and points at the sale, instead of rendering an empty table that
 * reads as "this invoice has nothing in it".
 *
 * THE DISCOUNT IS SHOWN ON THE LINE THAT EARNED IT, not netted into its total.
 * `lineTotal` is deliberately GROSS — the same choice `posTransactions` makes —
 * because a customer reading a bill wants to see what a thing costs and what
 * came off it, not one number that silently contains both.
 *
 * DPP AND PPN ARE SHOWN ONLY WHEN THERE IS TAX. A tenant that charges none would
 * otherwise read two rows of zero and wonder what they were for.
 */
export function InvoiceItemsTable({
  invoice,
}: {
  invoice: CustomerInvoiceDetail;
}) {
  /*
    DEFENSIVE AGAINST ITS OWN TYPE, and it was paid for. `CustomerInvoiceDetail`
    declares `items: CustomerInvoiceItem[]`, but a document written before
    PCR-030 has no such key: reads use `.lean()`, which skips schema defaults, so
    the field arrives `undefined` and `.length` threw.

    The server normalises this now, which is the real fix. This stays because a
    TYPE IS A PROMISE ABOUT DATA THAT ARRIVES OVER A WIRE — TypeScript checks
    that this file agrees with the declaration, never that the declaration agrees
    with the database. One old row must not be able to take down a page.
  */
  const items = invoice.items ?? [];
  const totals = invoice.totals ?? null;
  const invoiceDiscount = invoice.invoiceDiscount ?? null;

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        {invoice.posTransactionId
          ? "Faktur ini lahir dari penjualan kasir — barisnya tercatat di transaksi kasirnya, bukan di sini."
          : "Faktur ini tidak punya rincian baris."}
      </p>
    );
  }

  const discountLabel = (mode: string, value: string) =>
    mode === "percent" ? `${Number(value)}%` : formatMoney(value);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead className="text-right">Diskon</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={`${item.refId}-${index}`}>
                <TableCell>
                  <span className="font-medium">{item.name}</span>
                  {/*
                    THE ANIMAL, on a service line that names one — PCR-035. A
                    bill for three cats has to say which three: the customer
                    checking it and the groomer reading it both need the names,
                    and "Grooming ×3" tells neither of them whose bath was
                    missed. Falls back to the SKU, which is a product's own
                    identifier, and to "Jasa" for a service with no animal.
                  */}
                  <span className="block text-xs text-muted">
                    {item.petName ?? item.sku ?? "Jasa"}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQty(item.qty)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.discount ? (
                    <>
                      <span className="text-success">
                        −{formatMoney(item.discount.resolvedAmount)}
                      </span>
                      {/* What was TYPED, beside what it came to. "10%" is what
                          was agreed with the customer; the rupiah is what it
                          worked out as. */}
                      <span className="block text-xs text-muted">
                        {discountLabel(item.discount.mode, item.discount.value)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totals && (
        <dl className="flex flex-col gap-2 self-end text-sm sm:w-72">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
          </div>

          {totals.itemDiscount !== "0.0000" && (
            <div className="flex justify-between">
              <dt className="text-muted">Diskon baris</dt>
              <dd className="tabular-nums text-success">
                −{formatMoney(totals.itemDiscount)}
              </dd>
            </div>
          )}

          {invoiceDiscount && (
            <div className="flex justify-between">
              <dt className="text-muted">
                Diskon faktur{" "}
                <span className="text-xs">
                  ({discountLabel(invoiceDiscount.mode, invoiceDiscount.value)})
                </span>
              </dt>
              <dd className="tabular-nums text-success">
                −{formatMoney(totals.invoiceDiscount)}
              </dd>
            </div>
          )}

          {/* Only where there is tax to break out. */}
          {totals.tax !== "0.0000" && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted">DPP</dt>
                <dd className="tabular-nums">{formatMoney(totals.dpp)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">PPN</dt>
                <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
              </div>
            </>
          )}

          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <dt>Total tagihan</dt>
            <dd className="tabular-nums">{formatMoney(totals.grandTotal)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
