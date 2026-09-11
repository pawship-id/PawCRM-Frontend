import { Fragment } from "react";
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { speciesLabel } from "@/features/pets";
import {
  formatMoney,
  formatQty,
  isPositive,
  subtractDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceItem,
  CustomerInvoiceTotals,
} from "@/types/api";

const ZERO = BigInt(0);

/** A decimal string to minor units, with anything absent read as zero. */
const minor = (value: string | null | undefined): bigint =>
  toMinor(value ?? "0") ?? ZERO;

/**
 * WHETHER THE TAX WAS ADDED ON TOP of the prices, read off the frozen totals.
 *
 * NOT THE TENANT'S SETTING TODAY, which may have moved since the invoice was
 * issued. The totals say it themselves: on inclusive pricing the grand total is
 * what is left after the discounts (plus any other charges), and on exclusive
 * pricing it is that plus the tax. Whatever the difference is, it was charged on
 * top.
 */
function taxAddedOnTop(totals: CustomerInvoiceTotals | null): boolean {
  if (!totals || minor(totals.tax) === ZERO) return false;

  const beforeTax =
    minor(totals.subtotal) -
    minor(totals.itemDiscount) -
    minor(totals.invoiceDiscount) +
    minor(totals.otherCharges);

  return minor(totals.grandTotal) - beforeTax > ZERO;
}

/** "11" → "11", "11.5" → "11,5" — the rate as a person writes it. */
const formatRate = (rate: number) => String(rate).replace(".", ",");

/**
 * WHAT WAS BILLED — the lines, and the arithmetic that turned them into a total.
 *
 * THE MOCKUP'S LAYOUT (`buloo-invoice-detail-v5`): Item · Harga · Jumlah · Diskon
 * · Pajak · Total, grouped per animal, with the recap beneath.
 *
 * IT RENDERS A TILL SALE AND A HAND-TYPED BILL WITHOUT KNOWING WHICH IT HAS. The
 * document does not STORE a till sale's lines — two records of one basket are
 * free to disagree — but the detail read joins them from the sale under the same
 * field names, so there is one table rather than two layouts free to drift.
 *
 * A TILL SALE BRINGS TWO ROWS THE INVOICE SHAPE HAS NO FIELD FOR, and both are in
 * the recap because without them it does not add up: the additive charges
 * (ongkir), and — on a sale settled partly at the counter — what was handed over
 * there.
 *
 * THE LINE'S TOTAL IS WHAT THE LINE COSTS THE CUSTOMER: its quantity at its price,
 * less its own discount, plus its tax where the tax was added on top. The
 * discount and the tax stay visible in their own columns, so nobody has to work
 * out what the one number contains. The invoice-level discount is not spread
 * into it — that is the recap's row, where it was typed.
 *
 * DPP AND PPN ARE SHOWN ONLY WHEN THERE IS TAX. A tenant that charges none would
 * otherwise read two rows of zero and wonder what they were for.
 */
export function InvoiceItemsTable({
  invoice,
  canOpenBookings = false,
}: {
  invoice: CustomerInvoiceDetail;
  /**
   * `bookings:read` — whether the booking chip on an animal's group is a link.
   * A link that lands on "Akses ditolak" is worse than a label.
   */
  canOpenBookings?: boolean;
}) {
  /*
    DEFENSIVE AGAINST ITS OWN TYPE, and it was paid for. A document written
    before PCR-030 has no `items` key at all — reads use `.lean()`, which skips
    schema defaults — so `.length` threw. The server normalises this now; this
    stays because a type is a promise about data that arrives over a wire.
  */
  const items = invoice.items ?? [];
  const totals = invoice.totals ?? null;
  const invoiceDiscount = invoice.invoiceDiscount ?? null;
  const bookings = invoice.bookings ?? [];
  /* Till sales only — see the header. Absent on a hand-raised invoice. */
  const charges = invoice.otherCharges ?? [];
  const settlement = invoice.posSettlement ?? null;
  /*
    WHAT THE COUNTER TOOK, derived from the two figures the sale froze rather
    than by adding up the settlement lines: a cash line records what was TENDERED
    and the change beside it, so summing them would overstate what was paid by
    exactly the change given back.
  */
  const paidAtTill =
    totals && settlement?.credit
      ? subtractDecimals(totals.grandTotal, settlement.credit)
      : "0";
  const partlyPaidAtTill = isPositive(settlement?.credit ?? "0");

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        {invoice.posTransactionId
          ? "Faktur ini lahir dari penjualan kasir — barisnya tercatat di transaksi kasirnya, bukan di sini."
          : "Faktur ini tidak punya rincian baris."}
      </p>
    );
  }

  const addedOnTop = taxAddedOnTop(totals);
  const taxRate = totals?.taxRate ?? null;
  const hasTax = totals ? minor(totals.tax) !== ZERO : false;

  const discountLabel = (mode: string, value: string) =>
    mode === "percent" ? `${Number(value)}%` : formatMoney(value);

  const lineAmount = (item: CustomerInvoiceItem) => {
    let amount = minor(item.lineTotal) - minor(item.discount?.resolvedAmount);
    if (addedOnTop && item.tax) amount += minor(item.tax);
    return toDecimalString(amount);
  };

  /*
    GROUPED BY ANIMAL, the moment one line names one — the mockup's rule, and
    the way somebody reads a bill for two cats: whose grooming, then whose, then
    the food that belongs to nobody in particular.

    A GROUP PER ANIMAL, NOT PER RUN OF LINES. A nail trim added after the food
    still sits with the grooming it belongs to, so an add-on and its service read
    as one visit. Animals keep the order they first appear in; lines with no
    animal close the table.

    NO HEADINGS AT ALL on a bill with no animal on it — a single "Tanpa hewan"
    row over two bags of food is a heading for a question nobody asked.
  */
  const hasAnimals = items.some((item) => item.petId || item.petName);
  const groups: {
    key: string;
    petName: string | null;
    species: CustomerInvoiceItem["petSpecies"];
    bookingId: string | null;
    rows: { item: CustomerInvoiceItem; index: number }[];
  }[] = [];

  items.forEach((item, index) => {
    const key = hasAnimals
      ? (item.petId ?? item.petName ?? "__tanpa-hewan__")
      : "__semua__";
    let group = groups.find((one) => one.key === key);

    if (!group) {
      group = {
        key,
        petName: item.petName ?? null,
        species: item.petSpecies ?? null,
        bookingId: item.bookingId ?? null,
        rows: [],
      };
      groups.push(group);
    }

    group.rows.push({ item, index });
  });

  groups.sort((a, b) =>
    a.key === "__tanpa-hewan__" ? 1 : b.key === "__tanpa-hewan__" ? -1 : 0,
  );

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
              <TableHead>Pajak</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              /*
                THE LINE'S OWN NUMBER FIRST. The server resolves it per line,
                which is the only place a till sale's bookings are named —
                `bookings[]` is built from the document's stored lines, and a
                till invoice stores none. `bookings[]` is the fallback for a
                response that predates it.
              */
              const bookingNumber =
                group.rows.find(({ item }) => item.bookingNumber)?.item
                  .bookingNumber ??
                (group.bookingId
                  ? bookings.find((one) => one._id === group.bookingId)
                      ?.bookingNumber
                  : null) ??
                null;
              const chipLabel = bookingNumber
                ? `Booking ${bookingNumber}`
                : "Booking";

              return (
                <Fragment key={group.key}>
                  {hasAnimals && (
                    <TableRow className="bg-surface-hover hover:bg-surface-hover">
                      <TableCell colSpan={6} className="py-2">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold text-primary">
                          {group.key === "__tanpa-hewan__"
                            ? "Tanpa hewan"
                            : (group.petName ?? "Hewan terhapus")}
                          {group.species && (
                            <span className="text-xs font-medium tracking-wide text-muted uppercase">
                              {speciesLabel(group.species)}
                            </span>
                          )}
                          {/*
                            THE APPOINTMENT BEHIND THE GROUP, one chip for the
                            whole visit — a grooming and its nail trim are one
                            booking, and a chip per line would say it twice.
                          */}
                          {group.bookingId &&
                            (canOpenBookings ? (
                              <Link
                                href={`/dashboard/booking/${group.bookingId}`}
                                className="rounded-full bg-secondary/25 px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                              >
                                <span className="tabular-nums">
                                  {chipLabel}
                                </span>{" "}
                                →
                              </Link>
                            ) : (
                              <span className="rounded-full bg-secondary/25 px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground tabular-nums">
                                {chipLabel}
                              </span>
                            ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  )}

                  {group.rows.map(({ item, index }) => (
                    <TableRow key={`${item.refId}-${index}`}>
                      <TableCell>
                        <span className="font-medium">{item.name}</span>
                        <span className="block text-xs text-muted tabular-nums">
                          {item.sku ?? "Jasa"}
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
                            {/* RED, as the mockup draws a deduction. The
                                brighter `--danger` is under 4.5:1 as plain
                                text, so at this size it stays semibold and
                                paired with a word ("−") — the pairing
                                ui-rules §13 asks for around that known debt. */}
                            <span className="font-semibold text-danger">
                              −{formatMoney(item.discount.resolvedAmount)}
                            </span>
                            {/* What was TYPED, beside what it came to — "10%" is
                                what was agreed with the customer. */}
                            {item.discount.mode === "percent" && (
                              <span className="block text-xs text-muted">
                                {discountLabel(
                                  item.discount.mode,
                                  item.discount.value,
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {/*
                        THE TAX THIS LINE ACTUALLY CARRIED, frozen at issue — never
                        recomputed. NULL ON EVERY INVOICE RAISED BEFORE IT WAS
                        STORED, and a dash is the honest answer there.

                        THE CODE, NOT A SENTENCE: "PPN 11%" when the rate was frozen
                        with the invoice, "PPN" alone when it was not — a rate read
                        off today's settings could name one the bill never used.
                      */}
                      <TableCell className="tabular-nums">
                        {item.tax === null || item.tax === undefined ? (
                          <span className="text-muted">—</span>
                        ) : minor(item.tax) === ZERO ? (
                          <span className="text-xs text-muted">Non-PPN</span>
                        ) : (
                          <>
                            <span className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-semibold text-primary">
                              {taxRate !== null
                                ? `PPN ${formatRate(taxRate)}%`
                                : "PPN"}
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-success">
                              {addedOnTop
                                ? `+${formatMoney(item.tax)}`
                                : `termasuk ${formatMoney(item.tax)}`}
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatMoney(lineAmount(item))}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totals && (
        <dl className="flex w-full flex-col gap-2 self-end text-sm sm:w-80">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
          </div>

          {totals.itemDiscount !== "0.0000" && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Diskon item</dt>
              <dd className="tabular-nums font-semibold text-danger">
                −{formatMoney(totals.itemDiscount)}
              </dd>
            </div>
          )}

          {/*
            KEYED ON THE AMOUNT, not on the typed discount beside it. A till sale
            carries its basket discount on the SALE, so `invoiceDiscount` is null
            there while the figure is not. The "(10%)" label still needs the typed
            form, so it appears only where there is one.
          */}
          {totals.invoiceDiscount !== "0.0000" && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                Diskon faktur
                {invoiceDiscount && (
                  <span className="text-xs">
                    {" "}
                    ({discountLabel(invoiceDiscount.mode, invoiceDiscount.value)}
                    )
                  </span>
                )}
              </dt>
              <dd className="tabular-nums font-semibold text-danger">
                −{formatMoney(totals.invoiceDiscount)}
              </dd>
            </div>
          )}

          {/*
            ITEMISED, in the order they were added. "Biaya lain Rp 25.000" on a
            bill explains nothing. Till sales only.
          */}
          {charges.map((charge, index) => (
            <div
              key={`${charge.label}-${index}`}
              className="flex justify-between gap-4"
            >
              <dt className="text-muted">{charge.label}</dt>
              <dd className="tabular-nums">+{formatMoney(charge.amount)}</dd>
            </div>
          ))}

          {/*
            UNDER A DASHED RULE, as the mockup draws it: the base and the tax are
            a breakdown of what is above, not two more things added to it — which
            on inclusive pricing is literally true, so the row says "sudah
            termasuk" there rather than letting the eye add it.
          */}
          {hasTax && (
            <div className="flex flex-col gap-2 border-t border-dashed border-border pt-2">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Dasar pengenaan pajak</dt>
                <dd className="tabular-nums">{formatMoney(totals.dpp)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">
                  {taxRate !== null ? `PPN ${formatRate(taxRate)}%` : "PPN"}
                  {!addedOnTop && (
                    <span className="text-xs"> (sudah termasuk)</span>
                  )}
                </dt>
                <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
              </div>
            </div>
          )}

          <div className="flex justify-between gap-4 border-t-[1.5px] border-primary pt-2.5 text-base font-bold">
            <dt>{partlyPaidAtTill ? "Total belanja" : "Total tagihan"}</dt>
            <dd className="tabular-nums">{formatMoney(totals.grandTotal)}</dd>
          </div>

          {/*
            THE SPLIT, ON A SALE PART-PAID AT THE COUNTER. This invoice is the
            REMAINDER — 100.000 handed over on a 300.000 basket raises a 200.000
            receivable — and a recap that stopped at "Total belanja" would
            contradict the figure beside it by exactly what was already paid.
          */}
          {partlyPaidAtTill && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Dibayar di kasir</dt>
                <dd className="tabular-nums text-success">
                  −{formatMoney(paidAtTill)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 font-bold">
                <dt>Sisa jadi piutang</dt>
                <dd className="tabular-nums">
                  {formatMoney(settlement?.credit ?? "0")}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
