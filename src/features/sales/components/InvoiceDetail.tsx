"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
// The shadcn button rather than the project wrapper: every button on this screen
// is a link (`asChild`) or uses a shadcn-only variant, neither of which the
// wrapper's three-variant API exposes.
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import { daysUntil } from "@/utils/date";
import { cn } from "@/lib/utils";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { InvoiceSourceBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceExecutionPanel } from "./InvoiceExecutionPanel";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { JournalLink } from "./JournalLink";
import { VoidInvoiceDialog } from "./VoidInvoiceDialog";
import { PaymentHistory } from "./PaymentHistory";
import { PosSettlementCard } from "./PosSettlementCard";
import { PaymentReceiptDialog } from "./PaymentReceiptDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { VoidPaymentDialog } from "./VoidPaymentDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One receivable: what is owed, what has arrived, and the form to record more.
 *
 * ONE REQUEST. Unlike the payable's detail — which fetches the goods receipt to
 * show what it bills — a receivable carries its own totals and nothing else to
 * join. THE LINE ITEMS ARE NOT HERE, and their absence is the backend's shape
 * rather than an omission: `customerinvoices` stores a total, not an `items[]`.
 * They arrive with PCR-030, when an invoice can be raised by hand and has lines
 * of its own to store.
 *
 * RECORDING A PAYMENT DOES NOT REFETCH. `recordPayment` answers with the updated
 * invoice, so the response is handed straight to `applyInvoice`: it is the exact
 * document the write produced, rather than whatever a second read happens to
 * see, and it costs one round trip instead of two.
 *
 * THE FORM DISAPPEARS ONCE SETTLED OR VOIDED, and it is gated on `pay` besides.
 * A role that may read receivables but not take money sees the whole picture and
 * no way to move any — the separation of duties the backend enforces, made
 * visible rather than discovered through a 403.
 */
/**
 * Whose invoice this is — and the two different nulls, told apart by the ID.
 *
 * NO CUSTOMER AT ALL IS A WALK-IN. Since every till sale raises a faktur, not
 * only a credit one, most cash invoices have nobody attached: somebody bought a
 * bag of feed and left. "Pelanggan terhapus" there would accuse the shop of
 * losing a record it never had.
 *
 * AN ID WITH NO NAME is a customer somebody deleted since — and that debt still
 * stands, which is why the row says so rather than blanking.
 */
function customerLabel(invoice: {
  customerId: string | null;
  customerName: string | null;
}): string {
  if (invoice.customerName) return invoice.customerName;
  return invoice.customerId ? "Pelanggan terhapus" : "Pelanggan umum";
}

/**
 * What each entry IS, in the words a shopkeeper reads.
 *
 * Keyed on source type AND whether it reverses something, because those two
 * together are the whole taxonomy an invoice can produce — and a list of four
 * numbers with no labels would make somebody open all four to find the one they
 * want.
 */
const JOURNAL_ROLE: Record<string, string> = {
  "invoice:false": "Penerbitan",
  "invoice_cogs:false": "HPP",
  "invoice:true": "Pembalik penerbitan",
  "invoice_cogs:true": "Pembalik HPP",
  // A till-born invoice's entries belong to the SALE — see `belongsToSale`.
  "pos:false": "Penjualan kasir",
  "pos_cogs:false": "HPP kasir",
  "pos:true": "Pembalik penjualan",
  "pos_cogs:true": "Pembalik HPP kasir",
};

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    useCustomerInvoice(invoiceId);

  /*
    ONE PAYMENT AT A TIME, held by id rather than by object. The invoice is
    replaced wholesale after a cancellation, so a held object would be the stale
    copy from before the write — the dialog would then print a kwitansi that
    still said "aktif" for a payment it had just cancelled.
  */
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  /*
    READING THE LEDGER IS ITS OWN GRANT. A link that 403s on click is worse than
    plain text: it promises somewhere to go.
  */
  const { can } = usePermissions();
  const mayReadLedger = can("journalEntries", "read");

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail faktur…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Faktur tidak ditemukan.</p>
        <p className="max-w-sm text-sm text-muted">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/sales">← Semua faktur penjualan</Link>
        </Button>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">
          {error ?? "Gagal memuat detail faktur. Coba lagi."}
        </Alert>
        <div>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  const settled = invoice.status === "paid";
  const voided = invoice.status === "void";

  /*
    HOW FAR ALONG THE BILL IS, as a whole number.

    DERIVED FROM THE SERVER'S OWN FIGURES, not from a second sum: `paidAmount`
    already counts only ACTIVE payments — a cancelled one has posted its reversal
    and taken its money back out — and adding the timeline up here would count
    the cancelled ones too and draw a bar past a balance nobody paid.

    CLAMPED at 100 and guarded against a zero total: an invoice for nothing would
    otherwise divide by zero and render a bar of `NaN%`, which paints full.
  */
  const paidMinor = toMinor(invoice.paidAmount) ?? 0n;
  const totalMinor = toMinor(invoice.total) ?? 0n;
  const paidPercent =
    totalMinor === 0n
      ? 0
      : Math.min(100, Math.round(Number((paidMinor * 100n) / totalMinor)));
  /*
    ACTIVE ONLY. A cancelled payment has already posted its own reversal and taken
    its money back out, so it must not block a void — counting it would strand an
    invoice permanently after one mistyped payment was corrected. The same
    definition the server uses.
  */
  const hasActivePayment = (invoice.payments ?? []).some(
    (payment) => !payment.isVoided,
  );
  const lateBy = Math.abs(daysUntil(invoice.dueDate));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[...SALES_CRUMBS, { label: invoice.invoiceNumber }]}
          title={invoice.invoiceNumber}
        >
          {customerLabel(invoice)} · {invoice.branchName ?? "—"}
        </PageHeading>

        <div className="flex items-center gap-2">
          <InvoiceSourceBadge source={invoice.source} />
          <InvoiceStatusBadge status={invoice.status} />
          {/*
            BESIDE THE STATUS, not down with the payment form. Printing is
            something somebody does to the whole document, and it is asked for at
            the counter with a customer waiting — not after reading the page.

            A LINK, NOT A DIALOG. Printing is a task people come back to — the
            printer was out of paper, the customer wants another copy, somebody
            else has to send it — and a dialog cannot be linked to, opened in a
            second tab, or handed to a colleague.

            GATED ON `read`, WHICH IT ALREADY HAS: printing shows nothing the
            screen does not. A separate grant would be a permission that protects
            a screenshot.

            A VOIDED INVOICE STILL PRINTS, and the sheet says so in a red banner.
            Somebody re-printing one is usually doing it precisely because it was
            cancelled — the same rule the kwitansi follows.
          */}
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/dashboard/sales/${invoiceId}/print`}>
              <Printer className="size-4" />
              Cetak
            </Link>
          </Button>
        </div>
      </div>

      {/*
        THE OVERDUE BANNER IS THE SERVER'S VERDICT, not a date comparison done
        here. `isOverdue` already folds in "not settled and not void", which a
        calendar-only test would miss: `dueDate` keeps its value after payment,
        so every invoice ever paid late would light this up.
      */}
      {invoice.isOverdue && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">Lewat jatuh tempo {lateBy} hari</b> — sisa{" "}
          {formatMoney(invoice.outstandingAmount)} belum tertagih.
        </div>
      )}

      {/*
        TWO EXPLICIT COLUMNS, not a grid the cards flow into.

        This used to be one grid with every card dropped in sequentially, so the
        browser decided which column each landed in — and the answer changed with
        the invoice, because a card that does not render (no bookings, no
        journal) shifts everything after it. The result read as a different
        screen for every bill.

        LEFT IS THE DOCUMENT: what was sold, what was paid, what still has to
        happen, what it posted. RIGHT IS THE STATE OF IT: how much is owed, what
        it did to the shelf, what this customer owes altogether. The split is the
        mockup's, and it holds up — somebody reads the left column to check the
        bill and glances at the right to decide what to do about it.
      */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
        <Card
          title="Rincian faktur"
          description={
            voided
              ? undefined
              : "Terkunci sejak faktur terbit — barisnya tidak bisa diubah."
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Pelanggan">{customerLabel(invoice)}</Field>
            <Field label="Cabang">{invoice.branchName ?? "—"}</Field>
            <Field label="Dibuat oleh">
              {/* Null on a till-born invoice: the sale recorded who rang it up,
                  the receivable it raised did not stamp a separate author. */}
              {invoice.createdByName ?? "Otomatis dari kasir"}
            </Field>
            <Field label="Tanggal faktur">
              <span className="tabular-nums">
                {formatDate(invoice.invoiceDate)}
              </span>
            </Field>
            <Field label="Jatuh tempo">
              <span
                className={cn(
                  "tabular-nums",
                  invoice.isOverdue && "font-semibold text-danger-ink",
                )}
              >
                {formatDate(invoice.dueDate)}
              </span>
            </Field>
            <Field label="Sumber">
              {invoice.source === "pos_bridge"
                ? "Bridging dari kasir"
                : "Dibuat manual"}
            </Field>
          </dl>

          {/*
            THE LINES INSIDE THIS CARD, not in one of their own.

            They used to be a separate "Barang & jasa" card on the grounds that
            "who owes what" and "for what" are different questions. The mockup
            puts them together and is right: nobody reads an invoice's header
            without reading its lines, and two cards put a heading and a border
            between two halves of one document.
          */}
          <div className="mt-5 border-t border-border pt-4">
            <InvoiceItemsTable invoice={invoice} />
          </div>

          {/*
            THE FULL BREAKDOWN, not just the three headline figures.

            `totals` is what the server FROZE at issue, so every line here is
            read rather than computed.

            NOT FOR A TILL SALE, even though its `totals` now arrive too — joined
            from the sale rather than stored. The table above already lays that
            breakdown out with the rows this block has no field for (the other
            charges, and the part paid at the counter), so repeating a shorter
            version underneath would be two recaps of one basket that disagree
            about what the customer paid. Till invoices keep the two-row summary,
            which is the pair that answers "what is this document for".
          */}
          {invoice.totals && !invoice.posSettlement ? (
            <div className="mt-4 ml-auto flex w-full max-w-sm flex-col gap-1.5 border-t border-border pt-4 text-sm tabular-nums">
              <Row label="Subtotal" value={formatMoney(invoice.totals.subtotal)} muted />
              {invoice.totals.itemDiscount !== "0.0000" && (
                <Row
                  label="Diskon item"
                  value={`− ${formatMoney(invoice.totals.itemDiscount)}`}
                  muted
                />
              )}
              <Row
                label="Diskon faktur"
                value={
                  invoice.totals.invoiceDiscount === "0.0000"
                    ? formatMoney("0")
                    : `− ${formatMoney(invoice.totals.invoiceDiscount)}`
                }
                muted
              />
              <Row
                label="Dasar pengenaan pajak"
                value={formatMoney(invoice.totals.dpp)}
                muted
              />
              <Row label="PPN Keluaran" value={formatMoney(invoice.totals.tax)} muted />
              <div className="mt-1 border-t border-border pt-2">
                <Row label="Total tagihan" value={formatMoney(invoice.total)} strong />
              </div>
            </div>
          ) : (
            <div className="mt-4 ml-auto flex w-full max-w-sm flex-col gap-1.5 border-t border-border pt-4 text-sm">
              <Row label="Total tagihan" value={formatMoney(invoice.total)} strong />
              <Row
                label="Sudah dibayar"
                value={formatMoney(invoice.paidAmount)}
                muted
              />
            </div>
          )}

          {invoice.notes && (
            <p className="mt-4 border-t border-border pt-4 text-sm whitespace-pre-wrap">
              {invoice.notes}
            </p>
          )}
        </Card>

        {/*
          WHAT STILL HAS TO HAPPEN — PCR-035. Between the lines and the ledger
          deliberately: it answers "for what" the same way the card above does,
          but about work rather than money, and somebody scanning the page for
          "has the grooming been done" should not have to pass the journal to
          reach it.

          IT DRAWS NOTHING when the bill carries no services, which is most of
          them — an empty "Jadwal" card on an invoice for two bags of food is a
          question the reader never asked.
        */}
        {invoice.bookings.length > 0 && (
          <Card
            title="Jadwal & pengerjaan"
            description="Jasa di faktur ini dan siapa yang mengerjakannya."
          >
            <InvoiceExecutionPanel
              invoice={invoice}
              onChanged={(id, patch) =>
                applyInvoice({
                  ...invoice,
                  /*
                    PATCHED IN PLACE rather than refetched. The two endpoints
                    answer with a Booking document, not with this invoice's view
                    of one, so only the fields that actually moved are taken —
                    spreading the whole answer over the row would drop the
                    fields the invoice read assembled and the panel draws.
                  */
                  bookings: invoice.bookings.map((booking) =>
                    booking._id === id ? { ...booking, ...patch } : booking,
                  ),
                })
              }
            />
          </Card>
        )}

        {/*
          THE ENTRIES THIS INVOICE RAISED, named here because they cannot name
          themselves. An invoice's number is allocated AFTER its entries are
          posted — so a failed issue burns none — which means the number is not in
          their descriptions and the ledger's search box cannot find them by it.
          Without this card, "which journal entries belong to this invoice" is a
          question only the database can answer.
        */}
        {invoice.journalEntries.length > 0 && (
          <Card
            title="Jurnal yang diposting"
            description={
              invoice.posTransactionId
                ? "Entri buku besar dari penjualan kasir yang menerbitkan faktur ini."
                : "Entri buku besar yang lahir dari faktur ini."
            }
          >
            {/*
              SAID PLAINLY FOR A TILL-BORN INVOICE. Those entries cover the WHOLE
              sale — the cash part too — not just the amount left on account, so a
              reader comparing their totals against this bill would find them
              larger and reasonably conclude something was wrong.
            */}
            {invoice.posTransactionId && (
              <p className="mb-3 text-xs text-muted">
                Nilainya mencakup <strong>seluruh penjualan</strong>, termasuk
                bagian yang dibayar tunai — bukan hanya sisa yang jadi piutang
                ini.
              </p>
            )}
            {/*
              THE POSTINGS THEMSELVES, not only a link to them.

              The card used to list four entry numbers, which answered "which
              entries belong to this invoice" and nothing else — anybody asking
              "what did it actually debit" had to open the ledger four times. The
              accounts are the whole reason the entries are interesting.

              THE LINK STAYS beside each heading: the number is what somebody
              quotes, and the entry has more on it than this (its branch, who
              posted it, its own reversal).
            */}
            <div className="flex flex-col gap-4">
              {invoice.journalEntries.map((entry) => (
                <div key={entry._id}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">
                      {JOURNAL_ROLE[
                        `${entry.sourceType}:${entry.isReversal}`
                      ] ?? "Entri"}
                    </span>
                    <JournalLink
                      id={entry._id}
                      number={entry.entryNumber}
                      linked={mayReadLedger}
                    />
                  </div>

                  {entry.lines.length > 0 && (
                    <table className="mt-2 w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted">
                          <th className="py-1 text-left font-medium">Akun</th>
                          <th className="py-1 text-right font-medium">Debit</th>
                          <th className="py-1 text-right font-medium">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line, index) => (
                          <tr
                            key={`${line.accountId}-${index}`}
                            className="border-t border-border"
                          >
                            <td className="py-1.5">
                              {/* An account retired since the posting still
                                  shows its figures — dropping the row would make
                                  the entry stop balancing on screen. */}
                              {line.code ? (
                                <span className="tabular-nums">{line.code} </span>
                              ) : null}
                              {line.name ?? "Akun terhapus"}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                              {line.debit === "0.0000"
                                ? "—"
                                : formatMoney(line.debit)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                              {line.credit === "0.0000"
                                ? "—"
                                : formatMoney(line.credit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/*
          THE PAYMENT HISTORY BELONGS IN THE DOCUMENT COLUMN, not loose at the
          foot of the page where it used to render — outside the grid entirely,
          so it sat under both columns and read as an afterthought.
        */}
        {/*
          THE COUNTER'S OWN SETTLEMENT, above the collection history and separate
          from it. The two answer different questions — "how was this sale paid
          for" and "what has been collected against this debt since" — and a cash
          sale only ever has the first.
        */}
        {invoice.posSettlement && (
          <PosSettlementCard settlement={invoice.posSettlement} />
        )}

        {/*
          HIDDEN ENTIRELY ON A SETTLED TILL SALE. "Belum ada pembayaran untuk
          faktur ini" under a card that has just shown the money arriving is a
          contradiction, and there is nothing to collect: the sale was paid in
          full at the counter. It stays for a credit sale, where instalments
          against the remainder are exactly what this list is for.
        */}
        {!(invoice.posSettlement && invoice.payments.length === 0 && invoice.status === "paid") && (
          <PaymentHistory
            payments={invoice.payments}
            onPrint={(payment) => setReceiptFor(payment.paymentId)}
            onVoid={(payment) => setVoidingId(payment.paymentId)}
          />
        )}

        <div className="flex flex-col gap-4">
          {/*
            NOTHING HERE FOR A VOIDED INVOICE. The status card in the side column
            says it once, beside the figures it undoes — saying it twice on one
            screen reads as two different facts.

            AND NO PAYMENT FORM EITHER, since it moved into a dialog. It used to
            sit open on this column for every unpaid invoice, which put a form in
            front of everybody who came to READ one — and most visits are reads.
          */}
          {!voided && settled && (
            <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              Faktur ini sudah lunas.
            </div>
          )}
          {/*
            VOID SITS BELOW THE PAYMENT FORM, not beside it, and it is the last
            thing on the column on purpose: taking money is what this screen is
            usually opened to do, and unwinding the whole document is what it is
            opened to do rarely and deliberately.

            OFFERED ONLY WHILE NOTHING IS PAID. The server refuses otherwise
            (409), and a dialog that opens only to say "you cannot do this" is a
            dialog that should not have opened — so the reason is explained HERE,
            where somebody can act on it.
          */}
        </div>
        </div>

        {/*
          THE SIDE COLUMN — the STATE of the invoice rather than the document.

          STICKY, because it is what somebody keeps glancing at while reading a
          long bill: how much is left, and the two things they might do about it.
          `top-20` clears DashboardShell's own header, which is already sticky.
        */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card title="Status pembayaran">
            <div className="flex flex-col gap-3">
              {/*
                THE THREE FIGURES ON A DARK PANEL, the way the mockup draws them.
                Not decoration: this is the one block on the page somebody reads
                from across a desk, and the contrast is what makes the remaining
                balance findable without hunting.
              */}
              <div className="rounded-xl bg-primary px-4 py-3.5 text-primary-foreground">
                <div className="flex justify-between gap-3 text-sm opacity-80">
                  <span>Total tagihan</span>
                  <span className="tabular-nums">
                    {formatMoney(invoice.total)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-sm opacity-80">
                  <span>Terbayar</span>
                  <span className="tabular-nums">
                    {formatMoney(invoice.paidAmount)}
                  </span>
                </div>
                <div className="mt-2.5 flex items-baseline justify-between gap-3 text-lg font-bold">
                  <span>Sisa</span>
                  <span className="tabular-nums">
                    {voided ? "—" : formatMoney(invoice.outstandingAmount)}
                  </span>
                </div>
              </div>

              {/*
                A BAR AND A SENTENCE, and the sentence is what carries the fact —
                a bar alone is a shape nobody can quote. Hidden on a voided
                invoice: there is no progress towards paying something that was
                never owed.
              */}
              {!voided && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-success-fill"
                      style={{ width: `${paidPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    {paidPercent}% terbayar · jatuh tempo{" "}
                    {formatDate(invoice.dueDate)}
                  </p>
                </>
              )}

              {voided && (
                <p className="text-sm text-muted">
                  Faktur ini sudah di-void — tidak ada yang bisa ditagih.
                  Nomornya tetap tercatat dan tidak akan dipakai ulang.
                  {invoice.voidReason && (
                    <span className="mt-1 block italic">
                      Alasan: {invoice.voidReason}
                    </span>
                  )}
                </p>
              )}

              {/*
                THE ACTION THIS SCREEN IS USUALLY OPENED TO DO, beside the figure
                it changes.

                NAVY, NOT THE MOCKUP'S ORANGE. docs/ui-rules.md §7 says it
                outright: "There is deliberately no orange button variant in the
                product. Orange CTA buttons belong to the marketing site." §4
                adds the reason — orange is a FILL that means "a human must act",
                and a product that spends it on its most-pressed button has
                nothing left to say it with. This is the primary action on the
                screen, which is exactly what `default` is for.

                GATED ON `pay`, and a role without it is TOLD rather than left to
                wonder where the button went: the separation of duties the backend
                enforces, made visible instead of discovered through a 403.
              */}
              {!voided && !settled && (
                <Can
                  feature="customerInvoices"
                  action="pay"
                  fallback={
                    <p className="text-xs text-muted">
                      Anda tidak punya izin mencatat pembayaran. Hubungi pemegang
                      hak{" "}
                      <span className="tabular-nums">customerInvoices:pay</span>.
                    </p>
                  }
                >
                  <Button
                    className="w-full"
                    onClick={() => setPayOpen(true)}
                  >
                    <Plus className="size-4" />
                    Catat pembayaran
                  </Button>
                </Can>
              )}

              {/*
                VOID LIVES HERE NOW, beside the figures it undoes rather than at
                the foot of a column. Its refusal is still explained where
                somebody can act on it: the server answers 409 while a payment
                still counts, and a dialog that opens only to say "you cannot do
                this" is a dialog that should not have opened.
              */}
              {!voided && (
                <Can feature="customerInvoices" action="void">
                  {hasActivePayment ? (
                    <p className="text-xs text-muted">
                      Void terkunci karena masih ada pembayaran aktif. Batalkan
                      pembayarannya dulu — masing-masing memposting jurnal
                      pembaliknya sendiri. Nomor faktur tidak pernah dipakai
                      ulang.
                    </p>
                  ) : (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => setVoidOpen(true)}
                    >
                      Void faktur
                    </Button>
                  )}
                </Can>
              )}
            </div>
          </Card>

          {/*
            WHAT LEFT THE SHELF, and WHEN. Stock goes when the invoice is ISSUED,
            not when it is paid — which surprises people, and until now nothing on
            this screen said so.

            ABSENT ENTIRELY for a bill that shipped nothing: a "Dampak stok"
            heading over an empty card invites the reader to wonder what broke.
          */}
          {invoice.stockImpact.length > 0 && (
            <Card
              title="Dampak stok"
              description="Dipotong saat faktur terbit, bukan saat lunas."
            >
              <div className="flex flex-col text-sm">
                {invoice.stockImpact.map((row) => (
                  <div
                    key={row.productId}
                    className="flex justify-between gap-3 border-t border-border py-2 first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0">{row.name ?? "Produk terhapus"}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {row.before === null || row.after === null
                        ? formatQty(row.qty)
                        : `${formatQty(row.before)} → ${formatQty(row.after)}`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/*
            WHAT THIS CUSTOMER OWES ALTOGETHER — every live receivable, not just
            this one. It is the number a decision about the next sale is made
            against, and reading it here saves opening the customer.
          */}
          {invoice.credit && (
            <Card title="Piutang pelanggan" description={invoice.customerName ?? undefined}>
              <div className="flex flex-col gap-2 text-sm tabular-nums">
                <Row
                  label="Piutang berjalan"
                  value={formatMoney(invoice.credit.outstanding)}
                  strong
                />
                {/*
                  NO CEILING IS NOT ZERO LEFT. "Tanpa plafon" and "Rp 0 tersisa"
                  are opposite facts, and a card that printed the second for the
                  first would stop a sale nobody meant to stop.
                */}
                <Row
                  label="Plafon kredit"
                  value={
                    invoice.credit.creditLimit === null
                      ? "Tanpa plafon"
                      : formatMoney(invoice.credit.creditLimit)
                  }
                  muted
                />
                {invoice.credit.remaining !== null && (
                  <Row
                    label="Sisa plafon"
                    value={formatMoney(invoice.credit.remaining)}
                    muted
                  />
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <RecordPaymentDialog
        invoice={invoice}
        open={payOpen}
        onOpenChange={setPayOpen}
        onPaid={applyInvoice}
      />

      <VoidInvoiceDialog
        invoice={invoice}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onVoided={applyInvoice}
      />

      <PaymentReceiptDialog
        invoice={invoice}
        payment={
          invoice.payments.find((row) => row.paymentId === receiptFor) ?? null
        }
        onClose={() => setReceiptFor(null)}
      />

      <VoidPaymentDialog
        invoice={invoice}
        payment={
          invoice.payments.find((row) => row.paymentId === voidingId) ?? null
        }
        onClose={() => setVoidingId(null)}
        onVoided={applyInvoice}
      />

      {/*
        NOT "no journal was posted". The debt was debited to 1103 by the SALE
        when it posted; this document is that debt's paperwork. Saying so here is
        what stops somebody looking for a second entry that recognises it.
      */}
      <p className="text-xs text-muted">
        Piutang ini sudah didebit ke <b>1103 Piutang Usaha</b> saat penjualannya
        diposting. Tiap pembayaran memposting jurnalnya sendiri —{" "}
        <b>Dr rekening penerima / Cr 1103</b> — dan jurnal itu permanen.
      </p>
    </div>
  );
}

/** One label/value pair in the header grid. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** One line of the money summary. */
function Row({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn("text-sm", muted ? "text-muted" : "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-base font-semibold" : "text-sm",
          muted && "text-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
