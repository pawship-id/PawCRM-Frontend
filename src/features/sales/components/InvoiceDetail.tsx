"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  EllipsisVertical,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
} from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
// The shadcn button rather than the project wrapper: several buttons here are
// links (`asChild`) or use a shadcn-only variant, which the wrapper's
// three-variant API does not expose.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can, usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import { daysUntil } from "@/utils/date";
import { cn } from "@/lib/utils";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { InvoiceActivityCard } from "./InvoiceActivityCard";
import { InvoiceEditor } from "./InvoiceEditor";
import { InvoiceExecutionPanel } from "./InvoiceExecutionPanel";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { InvoiceJournalDialog } from "./InvoiceJournalDialog";
import { InvoicePaymentTimeline } from "./InvoicePaymentTimeline";
import { InvoiceSourceBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { VoidInvoiceDialog } from "./VoidInvoiceDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Whose invoice this is — and the two different nulls, told apart by the ID.
 *
 * NO CUSTOMER AT ALL IS A WALK-IN. Since every till sale raises a faktur, most
 * cash invoices have nobody attached; "Pelanggan terhapus" there would accuse the
 * shop of losing a record it never had. AN ID WITH NO NAME is a customer somebody
 * deleted since — and that debt still stands.
 */
function customerLabel(invoice: {
  customerId: string | null;
  customerName: string | null;
}): string {
  if (invoice.customerName) return invoice.customerName;
  return invoice.customerId ? "Pelanggan terhapus" : "Pelanggan umum";
}

/**
 * ONE INVOICE — laid out after `buloo-invoice-detail-v5`.
 *
 * LEFT IS THE DOCUMENT: the Rincian card (header, lines, recap — editable while
 * nothing is paid), then the work it still owes and how the counter settled it.
 * RIGHT IS ITS STATE: what is left to collect and what has arrived, then what it
 * did to the shelf and what the customer owes altogether. The activity log closes
 * the page, folded.
 *
 * TWO COLUMNS WRITTEN OUT, not a grid the cards flow into: a card that does not
 * render would otherwise shift everything after it into the other column, and
 * the screen would read differently for every bill.
 *
 * EVERY WRITE ANSWERS WITH THE INVOICE, and `applyWrite` takes it as it comes —
 * the exact document the write produced, one round trip instead of two — and
 * bumps the activity log so an open log shows the row for what was just done.
 *
 * WHAT MOVED FROM THE OLD LAYOUT, and why none of it went away:
 *   the journal card → the ⋮ on the Rincian card ("Lihat jurnal");
 *   per-payment Kwitansi / Batalkan → each payment's own page, one click from
 *     the timeline;
 *   Batalkan faktur → the ⋮ beside Cetak, where the mockup puts it.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound, applyInvoice, refetch } =
    useCustomerInvoice(invoiceId);

  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activityVersion, setActivityVersion] = useState(0);

  const { can } = usePermissions();

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

  const applyWrite = (next: typeof invoice) => {
    applyInvoice(next);
    setActivityVersion((version) => version + 1);
  };

  const settled = invoice.status === "paid";
  const voided = invoice.status === "void";
  const payments = invoice.payments ?? [];

  /*
    HOW FAR ALONG THE BILL IS, from the server's own figures. `paidAmount`
    already counts only ACTIVE payments, so summing the timeline here would count
    cancelled ones too. Clamped at 100 and guarded against a zero total, which
    would otherwise render `NaN%` — and that paints full.
  */
  const paidMinor = toMinor(invoice.paidAmount) ?? BigInt(0);
  const totalMinor = toMinor(invoice.total) ?? BigInt(0);
  const paidPercent =
    totalMinor === BigInt(0)
      ? 0
      : Math.min(
          100,
          Math.round(Number((paidMinor * BigInt(100)) / totalMinor)),
        );
  /*
    ACTIVE ONLY — a cancelled payment has posted its own reversal and must not
    block anything. The same definition the server uses.
  */
  const hasActivePayment = payments.some((payment) => !payment.isVoided);
  const lateBy = Math.abs(daysUntil(invoice.dueDate));
  const tillBorn = invoice.source === "pos_bridge" || !!invoice.posTransactionId;

  /*
    EDITABLE EXACTLY WHEN THE SERVER WILL ACCEPT AN EDIT: raised here, nothing
    paid, not cancelled — and `update` held. A button that 409s is a button that
    should not have been drawn. `editing` is re-checked against it, so a payment
    recorded in another tab closes an open editor on the next read rather than
    letting it save into a refusal.
  */
  const editable =
    !tillBorn && invoice.status === "unpaid" && !hasActivePayment;
  const mayEdit = editable && can("customerInvoices", "update");
  const isEditing = editing && mayEdit;

  const lockNote = isEditing
    ? "Sedang diubah — belum tersimpan."
    : voided
      ? "Faktur ini sudah dibatalkan."
      : tillBorn
        ? "Lahir dari penjualan kasir — barisnya milik transaksi kasir dan tidak diubah di sini."
        : editable
          ? "Belum ada pembayaran — faktur masih bisa diubah. Terkunci otomatis begitu pembayaran pertama tercatat."
          : "Terkunci sejak ada pembayaran tercatat — batalkan pembayarannya dulu untuk mengubah.";

  /*
    THE WHATSAPP MESSAGE, in the shop's voice and with the figures the customer
    will be asked about. The number is the server's `wa.me` form — derived by the
    one module that decides what a WhatsApp number looks like.

    WITH A LINK TO THE FAKTUR ITSELF — /faktur/:token, the customer's own copy,
    opened with no account: the invoice's counterpart of the till's /struk link.
    Built from `window.location.origin` for the reason `ReceiptDialog` gives: the
    dashboard and the public page are one app, so whatever host the shop is on is
    the host the customer must be sent to.

    AN INVOICE WITH NO TOKEN YET — raised before links existed, until the backend
    backfill runs — sends the figures without a link, rather than a link that
    leads nowhere.
  */
  const outstanding = toMinor(invoice.outstandingAmount) ?? BigInt(0);
  const invoiceLink =
    invoice.publicToken && typeof window !== "undefined"
      ? `${window.location.origin}/faktur/${invoice.publicToken}`
      : null;
  const whatsappText = [
    `Halo ${invoice.customerName ?? "Kak"}, berikut faktur ${invoice.invoiceNumber} sebesar ${formatMoney(invoice.total)}`,
    outstanding > BigInt(0)
      ? `, sisa tagihan ${formatMoney(invoice.outstandingAmount)} dengan jatuh tempo ${formatDate(invoice.dueDate)}.`
      : ", sudah lunas.",
    invoiceLink
      ? `\n\nLihat fakturnya di sini:\n${invoiceLink}\n\nTerima kasih.`
      : " Terima kasih.",
  ].join("");
  const whatsappHref = invoice.customerWhatsApp
    ? `https://wa.me/${invoice.customerWhatsApp}?text=${encodeURIComponent(whatsappText)}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[...SALES_CRUMBS, { label: invoice.invoiceNumber }]}
          title={invoice.invoiceNumber}
          // The status on the title line, beside the number it describes.
          aside={<InvoiceStatusBadge status={invoice.status} />}
        >
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {customerLabel(invoice)} · {invoice.branchName ?? "—"} ·
            </span>
            <InvoiceSourceBadge source={invoice.source} />
          </span>
        </PageHeading>

        <div className="flex items-center gap-2">
          {/*
            A LINK, NOT A DIALOG — printing is a task people come back to, and a
            dialog cannot be linked to or opened in a second tab. A cancelled
            invoice still prints, stamped as such.
          */}
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/dashboard/sales/${invoiceId}/print`}>
              <Printer className="size-4" />
              Cetak
            </Link>
          </Button>

          {/*
            NOT OFFERED ON A CANCELLED INVOICE — sending a customer a bill that no
            longer stands is the one message this button must not make easy.
            Disabled rather than hidden when there is no number, so the reason can
            be read.
          */}
          {!voided &&
            (whatsappHref ? (
              <Button variant="secondary" size="sm" asChild>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled
                title="Pelanggan ini belum punya nomor WhatsApp."
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </Button>
            ))}

          {/*
            BATALKAN FAKTUR, behind the ⋮ — the mockup's place, and the right one
            for an act done rarely and deliberately.

            ALWAYS CLICKABLE, even while a payment still counts. It used to be
            drawn disabled then, which read as a broken menu: a pale row that did
            nothing, on exactly the invoice somebody was trying to cancel. The
            server still refuses (409) while money is on it, so the dialog opens
            on the way forward instead — which payments to cancel first, each a
            link to the page where that is done. See VoidInvoiceDialog.
          */}
          {!voided && can("customerInvoices", "void") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Aksi lain untuk faktur ini"
                >
                  <EllipsisVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setVoidOpen(true)}
                  className="font-semibold"
                >
                  Batalkan faktur
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/*
        THE OVERDUE BANNER IS THE SERVER'S VERDICT, not a date comparison done
        here. `isOverdue` already folds in "not settled and not void".
      */}
      {invoice.isOverdue && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">Lewat jatuh tempo {lateBy} hari</b> — sisa{" "}
          {formatMoney(invoice.outstandingAmount)} belum tertagih.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ─── THE DOCUMENT ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title="Rincian faktur"
            description={lockNote}
            action={
              !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Aksi rincian faktur"
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mayEdit && (
                      <DropdownMenuItem onSelect={() => setEditing(true)}>
                        <Pencil className="size-4" />
                        Ubah rincian
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setJournalOpen(true)}>
                      <BookOpen className="size-4" />
                      Lihat jurnal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Pelanggan">{customerLabel(invoice)}</Field>
              <Field label="Cabang">{invoice.branchName ?? "—"}</Field>
              <Field label="Dibuat oleh">
                {/* Null on a till-born invoice: the sale recorded who rang it
                    up; the receivable it raised stamped no separate author. */}
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
              <Field label="Sumber">{tillBorn ? "Kasir" : "Manual"}</Field>
            </dl>

            <div className="mt-5 border-t border-border pt-4">
              {isEditing ? (
                <InvoiceEditor
                  invoice={invoice}
                  onCancel={() => setEditing(false)}
                  onSaved={(updated) => {
                    setEditing(false);
                    applyWrite(updated);
                  }}
                />
              ) : (
                <InvoiceItemsTable
                  invoice={invoice}
                  canOpenBookings={can("bookings", "read")}
                />
              )}
            </div>

            {invoice.notes && !isEditing && (
              <p className="mt-4 border-t border-border pt-4 text-sm whitespace-pre-wrap">
                {invoice.notes}
              </p>
            )}
          </Card>

          {/*
            WHAT STILL HAS TO HAPPEN — PCR-035. Kept beside the lines it answers
            for, and absent on a bill with no services on it.
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
                      PATCHED IN PLACE rather than refetched: the endpoints answer
                      with a Booking document, not with this invoice's view of
                      one, so only the fields that moved are taken.
                    */
                    bookings: invoice.bookings.map((booking) =>
                      booking._id === id ? { ...booking, ...patch } : booking,
                    ),
                  })
                }
              />
            </Card>
          )}
        </div>

        {/* ─── ITS STATE ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <Card title="Status pembayaran">
            <div className="flex flex-col gap-3">
              {/*
                THE THREE FIGURES ON A DARK PANEL: the one block on the page read
                from across a desk, and the contrast is what makes the balance
                findable without hunting.
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
                  <span>{voided ? "Dibatalkan" : "Sisa"}</span>
                  <span className="tabular-nums">
                    {voided ? "—" : formatMoney(invoice.outstandingAmount)}
                  </span>
                </div>
              </div>

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
                  Tidak ada yang bisa ditagih. Nomornya tetap tercatat dan tidak
                  akan dipakai ulang.
                  {invoice.voidReason && (
                    <span className="mt-1 block italic">
                      Alasan: {invoice.voidReason}
                    </span>
                  )}
                </p>
              )}

              {!voided && settled && (
                <p className="rounded-lg bg-tint-success px-3 py-2 text-sm font-medium text-success">
                  Faktur ini sudah lunas.
                </p>
              )}

              {/*
                NAVY, NOT THE MOCKUP'S ORANGE — docs/ui-rules.md §7: there is no
                orange button variant in the product. GATED ON `pay`, and a role
                without it is TOLD rather than left to wonder where it went.
              */}
              {!voided && !settled && !isEditing && (
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
                  <Button className="w-full" onClick={() => setPayOpen(true)}>
                    <Plus className="size-4" />
                    Catat pembayaran
                  </Button>
                </Can>
              )}
            </div>
          </Card>

          {/*
            HIDDEN ON A SETTLED TILL SALE WITH NO PAYMENT ROWS: "belum ada
            pembayaran" beside a status reading Lunas would contradict it. Since
            "POS hanya channel" a till sale settled at the counter HAS rows
            (`recordedVia: "pos"`), so this only still bites on sales settled
            before then, whose counter money never became rows.
          */}
          {!(invoice.posSettlement && payments.length === 0 && settled) && (
            <InvoicePaymentTimeline invoiceId={invoiceId} payments={payments} />
          )}

          {/*
            WHAT LEFT THE SHELF, and WHEN — stock goes when the invoice is ISSUED,
            not when it is paid. Absent for a bill that shipped nothing.
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
                    <span className="min-w-0">
                      {row.name ?? "Produk terhapus"}
                    </span>
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
            WHAT THIS CUSTOMER OWES ALTOGETHER — the number a decision about the
            next sale is made against. NO CEILING IS NOT ZERO LEFT.
          */}
          {invoice.credit && (
            <Card
              title="Piutang pelanggan"
              description={invoice.customerName ?? undefined}
            >
              <div className="flex flex-col gap-2 text-sm tabular-nums">
                <Row
                  label="Piutang berjalan"
                  value={formatMoney(invoice.credit.outstanding)}
                  strong
                />
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

      <InvoiceActivityCard invoice={invoice} version={activityVersion} />

      <RecordPaymentDialog
        invoice={invoice}
        open={payOpen}
        onOpenChange={setPayOpen}
        onPaid={applyWrite}
      />

      <VoidInvoiceDialog
        invoice={invoice}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onVoided={applyWrite}
      />

      <InvoiceJournalDialog
        invoice={invoice}
        open={journalOpen}
        onOpenChange={setJournalOpen}
      />
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

/** One line of a money summary. */
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
