"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
// The shadcn button rather than the project wrapper: every button on this screen
// is a link (`asChild`) or uses a shadcn-only variant, neither of which the
// wrapper's three-variant API exposes.
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { formatMoney } from "@/utils/decimal";
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
import { PaymentReceiptDialog } from "./PaymentReceiptDialog";
import { RecordPaymentForm } from "./RecordPaymentForm";
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
          {invoice.customerName ?? "Pelanggan terhapus"} · {invoice.branchName ?? "—"}
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

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <Card title="Rincian faktur">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Pelanggan">
              {invoice.customerName ?? "Pelanggan terhapus"}
            </Field>
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

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
            <Row label="Total tagihan" value={formatMoney(invoice.total)} />
            <Row
              label="Sudah dibayar"
              value={formatMoney(invoice.paidAmount)}
              muted
            />
            <Row
              label="Sisa tagihan"
              value={voided ? "—" : formatMoney(invoice.outstandingAmount)}
              strong
            />
          </div>

          {invoice.notes && (
            <p className="mt-4 border-t border-border pt-4 text-sm whitespace-pre-wrap">
              {invoice.notes}
            </p>
          )}
        </Card>

        {/*
          ITS OWN CARD, below the summary rather than inside it. The card above
          answers "who owes what"; this one answers "for what" — a different
          question, and one that does not exist at all for a till-born invoice.
        */}
        <Card title="Barang & jasa">
          <InvoiceItemsTable invoice={invoice} />
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
            title="Jurnal"
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
            <ul className="flex flex-col gap-2 text-sm">
              {invoice.journalEntries.map((entry) => (
                <li key={entry._id} className="flex justify-between gap-4">
                  <span className="text-muted">
                    {JOURNAL_ROLE[
                      `${entry.sourceType}:${entry.isReversal}`
                    ] ?? "Entri"}
                  </span>
                  <JournalLink
                    id={entry._id}
                    number={entry.entryNumber}
                    linked={mayReadLedger}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-col gap-4">
          {voided ? (
            <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
              Faktur ini sudah di-void — tidak ada yang bisa ditagih. Nomornya
              tetap tercatat dan tidak akan dipakai ulang.
              {invoice.voidReason && (
                <p className="mt-2 text-muted">
                  Alasan: <span className="italic">{invoice.voidReason}</span>
                </p>
              )}
            </div>
          ) : settled ? (
            <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              Faktur ini sudah lunas.
            </div>
          ) : (
            <Can
              feature="customerInvoices"
              action="pay"
              fallback={
                <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
                  Anda tidak punya izin mencatat pembayaran. Hubungi pemegang hak{" "}
                  <span className="tabular-nums text-xs">
                    customerInvoices:pay
                  </span>
                  .
                </div>
              }
            >
              <Card title="Catat pembayaran">
                <RecordPaymentForm invoice={invoice} onPaid={applyInvoice} />
              </Card>
            </Can>
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
          {!voided && (
            <Can feature="customerInvoices" action="void">
              {hasActivePayment ? (
                <p className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-xs text-muted">
                  Faktur ini tidak bisa di-void selama masih ada pembayaran
                  aktif. Batalkan pembayarannya dulu — masing-masing memposting
                  jurnal pembaliknya sendiri — lalu void jadi tersedia.
                </p>
              ) : (
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setVoidOpen(true)}
                >
                  Void faktur
                </Button>
              )}
            </Can>
          )}
        </div>
      </div>

      <VoidInvoiceDialog
        invoice={invoice}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onVoided={applyInvoice}
      />

      <PaymentHistory
        payments={invoice.payments}
        onPrint={(payment) => setReceiptFor(payment.paymentId)}
        onVoid={(payment) => setVoidingId(payment.paymentId)}
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

      <div>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/sales">← Semua faktur penjualan</Link>
        </Button>
      </div>
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
