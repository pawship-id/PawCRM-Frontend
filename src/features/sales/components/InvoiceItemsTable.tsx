import { Fragment } from "react";
import { PawPrint } from "lucide-react";

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

  /*
    GROUPED BY ANIMAL, the way the mockup lays it out and the way somebody reads
    a bill for three cats: whose grooming, then whose, then the food that belongs
    to nobody in particular.

    ORDER IS THE LINES' OWN, not alphabetical: the first time a pet appears
    decides where its block sits, so the sheet reads in the order the invoice was
    typed. Sorting would move a line somebody is looking for.

    PRODUCTS FALL INTO A LAST GROUP WITH NO PET. Putting a bag of food under the
    cat whose grooming happened to precede it would be a claim the invoice never
    made.
  */
  const groups: { petName: string | null; rows: typeof items }[] = [];
  for (const item of items) {
    const petName = item.petName ?? null;
    const last = groups[groups.length - 1];

    if (last && last.petName === petName) {
      last.rows.push(item);
    } else {
      groups.push({ petName, rows: [item] });
    }
  }

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
              <TableHead className="text-right">Pajak</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group, groupIndex) => (
              <Fragment key={`${group.petName ?? "umum"}-${groupIndex}`}>
                {/*
                  A HEADING ROW PER ANIMAL — and one for the goods that belong to
                  nobody. The second is not decoration: without it a reader
                  cannot tell where one cat's bill stops and the shop's shelf
                  begins.
                */}
                <TableRow className="bg-surface-hover hover:bg-surface-hover">
                  <TableCell colSpan={6} className="py-1.5 text-xs font-medium">
                    {group.petName ? (
                      <span className="flex items-center gap-1.5">
                        <PawPrint className="size-3.5 text-muted" />
                        {group.petName}
                      </span>
                    ) : (
                      <span className="text-muted">
                        Tanpa hewan — barang umum
                      </span>
                    )}
                  </TableCell>
                </TableRow>

                {group.rows.map((item, index) => (
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
                {/*
                  THE TAX THIS LINE ACTUALLY CARRIED, frozen when the invoice was
                  issued — never recomputed. A screen doing the arithmetic itself
                  would apply TODAY's rule to an old bill, and the parts would
                  stop adding up to the total printed beside them.

                  NULL ON EVERY INVOICE RAISED BEFORE IT WAS STORED, and an em
                  dash is the honest answer there: the allocation was not
                  recorded, and inventing one is worse than admitting it.
                */}
                <TableCell className="text-right text-xs tabular-nums text-muted">
                  {item.tax === null
                    ? "—"
                    : item.tax === "0.0000"
                      ? "Non-PPN"
                      : formatMoney(item.tax)}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.lineTotal)}
                </TableCell>
              </TableRow>
                ))}
              </Fragment>
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
