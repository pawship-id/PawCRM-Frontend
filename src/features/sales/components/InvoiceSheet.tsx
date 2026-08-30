"use client";

import { formatMoney, formatQty } from "@/utils/decimal";
import type { CustomerInvoiceDetail, Tenant } from "@/types/api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * The same date, short — for the payment lines inside the totals block.
 *
 * THE COLUMN IS 288px WIDE and the label shares it with an amount. "30 Agustus
 * 2026 (Mandiri)" plus a figure does not fit, and what wrapped was the AMOUNT:
 * "−Rp" on one line and "45.250" on the next, which is not a number anybody can
 * read down a column. The header dates keep the long form — they have a column
 * to themselves.
 */
function formatDateShort(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * WHAT THE CUSTOMER IS OWED AN ANSWER ABOUT — the invoice itself, on A4.
 *
 * A DIFFERENT DOCUMENT FROM THE KWITANSI, not a variant of it. A kwitansi says
 * "we received this money on this day", about one payment. This says "here is
 * what you bought and what you owe", about the whole bill. Printing one for the
 * other is the mistake `PaymentReceipt` warns about from its side: a customer
 * who paid a third of a bill would get a sheet headlining the whole of it.
 *
 * EVERY FIGURE IS READ, NEVER COMPUTED. `totals` is what the server FROZE at
 * issue, and this sheet is the one document a customer may hold against the
 * shop months later. Re-deriving a subtotal here would eventually print a
 * different number from the one in the ledger — with nothing to say which was
 * right, and a customer holding the paper.
 *
 * IT DEGRADES RATHER THAN BREAKS on an older invoice. Everything raised before
 * PCR-030 has `totals: null` and no `items`, because those documents were born
 * at the till and store a total and nothing else. The sheet then prints the
 * header, the total and the balance — which is all that document HAS. Refusing
 * to print it would deny a customer a copy of a bill that genuinely exists.
 *
 * A4 ONLY. The till's thermal struk already exists and serves the counter; an
 * invoice is filed, posted, or emailed to somebody's finance desk.
 *
 * NO BANK DETAILS YET. The mockup carries a "pembayaran ditujukan ke" line, and
 * inventing an account number on a customer-facing document is not a placeholder
 * anybody should ship. It belongs to the tenant's settings, which have no field
 * for it — see the note in Sales-Invoice-Progress.md.
 */
export function InvoiceSheet({
  invoice,
  tenant,
}: {
  invoice: CustomerInvoiceDetail;
  /** Null while the tenant read is in flight or failed — the header degrades. */
  tenant: Tenant | null;
}) {
  const totals = invoice.totals;
  const items = invoice.items ?? [];
  const voided = invoice.status === "void";

  /*
    THE PAYMENTS THAT STILL COUNT. A cancelled one has posted its own reversal
    and taken its money back out; listing it on a customer's copy would show a
    credit they do not have. The same "active only" rule `paidAmount` follows.
  */
  const paid = (invoice.payments ?? []).filter((payment) => !payment.isVoided);

  return (
    <div
      data-receipt-sheet="a4"
      className="mx-auto w-full bg-surface p-8 text-sm text-foreground"
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-primary pb-4">
        <div>
          <p className="text-lg font-bold text-primary">{tenant?.name ?? "—"}</p>
          {invoice.branchName && (
            <p className="mt-1 text-sm text-muted">{invoice.branchName}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-primary">FAKTUR</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-1 text-xs">
            <Meta label="No. Faktur">{invoice.invoiceNumber}</Meta>
            <Meta label="Tanggal">{formatDate(invoice.invoiceDate)}</Meta>
            <Meta label="Jatuh Tempo">{formatDate(invoice.dueDate)}</Meta>
          </dl>
        </div>
      </header>

      {/*
        SAID FIRST AND UNMISSABLY. A voided invoice that looks like a valid one
        is a document somebody can be asked to pay against — the single worst
        thing this sheet could produce.
      */}
      {voided && (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger-ink">
          FAKTUR INI DIBATALKAN
          {invoice.voidReason ? ` — ${invoice.voidReason}` : ""}. Tidak ada yang
          perlu dibayar.
        </p>
      )}

      <section className="mt-6">
        <p className="text-xs text-muted">Ditagihkan kepada</p>
        <p className="mt-0.5 font-semibold">
          {invoice.customerName ?? "Pelanggan terhapus"}
        </p>
      </section>

      {items.length > 0 && (
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="bg-navy-100 text-xs font-semibold text-primary">
              <th className="w-8 p-2.5 text-left">#</th>
              <th className="p-2.5 text-left">Deskripsi</th>
              <th className="p-2.5 text-right">Qty</th>
              <th className="p-2.5 text-right">Harga</th>
              <th className="p-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.refId}-${index}`} className="border-b border-border">
                <td className="p-2.5 tabular-nums">{index + 1}</td>
                <td className="p-2.5">
                  <span className="font-medium">{item.name}</span>
                  {/*
                    THE ANIMAL ON A SERVICE LINE, the same rule the on-screen
                    table follows: a bill for three cats has to say which three.
                    Falls back to the SKU for a product.
                  */}
                  <span className="block text-xs text-muted">
                    {item.petName ?? item.sku ?? "Jasa"}
                  </span>
                </td>
                <td className="p-2.5 text-right tabular-nums">
                  {formatQty(item.qty)}
                </td>
                <td className="p-2.5 text-right tabular-nums">
                  {formatMoney(item.unitPrice)}
                </td>
                <td className="p-2.5 text-right tabular-nums">
                  {formatMoney(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/*
        WIDER THAN THE MOCKUP'S 288px, because its payment line read "Dibayar 17
        Agu (BCA)" while a real one carries a full channel name — "Kas Toko
        C.Selatan". A long label may still wrap onto a second line; the figure
        beside it may not.
      */}
      <div className="mt-6 ml-auto w-80 max-w-full text-sm tabular-nums">
        {totals && (
          <>
            <Line label="Subtotal">{formatMoney(totals.subtotal)}</Line>
            {totals.itemDiscount !== "0.0000" && (
              <Line label="Diskon baris">
                −{formatMoney(totals.itemDiscount)}
              </Line>
            )}
            {totals.invoiceDiscount !== "0.0000" && (
              <Line label="Diskon faktur">
                −{formatMoney(totals.invoiceDiscount)}
              </Line>
            )}
            <Line label="PPN">{formatMoney(totals.tax)}</Line>
          </>
        )}

        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t-2 border-primary pt-2.5 text-base font-bold">
          <span className="min-w-0">Nilai Transaksi</span>
          <span className="shrink-0 whitespace-nowrap">
            {formatMoney(invoice.total)}
          </span>
        </div>

        {/*
          EACH PAYMENT ON ITS OWN LINE rather than one "Dibayar" figure. A
          customer reconciling a bill against their bank statement is matching
          individual transfers, and a single sum sends them back to ask which
          ones it covered.
        */}
        {paid.map((payment) => (
          <div
            key={payment.paymentId}
            className="flex items-baseline justify-between gap-3 py-1"
          >
            {/*
              THE LABEL GIVES WAY, NEVER THE FIGURE. `min-w-0` lets this wrap
              when a long channel name needs it; the amount beside it is
              `shrink-0 whitespace-nowrap` so it stays on one line and stays
              aligned with every other figure in the column.
            */}
            <span className="min-w-0">
              Dibayar {formatDateShort(payment.at)}
              {payment.channelName ? ` · ${payment.channelName}` : ""}
            </span>
            <span className="shrink-0 whitespace-nowrap">
              −{formatMoney(payment.amount)}
            </span>
          </div>
        ))}

        {!voided && (
          <div className="flex items-baseline justify-between gap-3 pt-1 text-base font-bold text-danger-ink">
            <span className="min-w-0">SISA TAGIHAN</span>
            <span className="shrink-0 whitespace-nowrap">
              {formatMoney(invoice.outstandingAmount)}
            </span>
          </div>
        )}
      </div>

      {invoice.notes && (
        <p className="mt-8 text-xs text-muted">
          <span className="font-semibold text-foreground">Catatan: </span>
          {invoice.notes}
        </p>
      )}

      {/*
        WHAT THE SHOP WROTE FOR ITSELF — usually where to send the money.

        ABOVE THE SIGNATURE BLOCK and below the totals, which is where the mockup
        puts "Pembayaran ditujukan ke: …": somebody who has just read what they
        owe reads how to pay it next.

        `whitespace-pre-line` IS LOAD-BEARING. Bank details run to two or three
        lines, and collapsing them turns a usable footer into a run-on sentence.

        NOTHING AT ALL WHEN EMPTY — no heading, no blank block. A shop that takes
        every payment at the counter has nothing to put here, and a stray label
        on a customer's copy is worse than a shorter page.

        NOT SHOWN ON A VOIDED INVOICE: "pembayaran ditujukan ke" on a bill that
        has been cancelled invites exactly the payment the void exists to stop.
      */}
      {!voided && tenant?.settings?.invoiceFooterNote && (
        <p className="mt-8 whitespace-pre-line border-t border-border pt-4 text-xs text-muted">
          {tenant.settings.invoiceFooterNote}
        </p>
      )}

      <footer className="mt-10 flex flex-wrap justify-between gap-5 text-xs text-muted">
        <p className="max-w-60 leading-relaxed">
          Dokumen ini dihasilkan sistem dan sah tanpa tanda tangan basah.
        </p>
        <div className="w-56 text-center">
          <div className="h-16" />
          <div className="border-t border-border pt-2">
            Hormat kami,
            <br />
            <span className="font-semibold text-foreground">
              {tenant?.name ?? "—"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="min-w-0">{label}</span>
      {/* Never breaks mid-figure — see the payment rows for what that looked like. */}
      <span className="shrink-0 whitespace-nowrap">{children}</span>
    </div>
  );
}
