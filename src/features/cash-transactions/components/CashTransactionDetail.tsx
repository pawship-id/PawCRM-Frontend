"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenText, MoreHorizontal, Pencil, Undo2 } from "lucide-react";

import { Alert, Breadcrumb, Card, JournalLink, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACCOUNTING_CRUMBS, SHARED_LINE_LABEL } from "@/features/accounting";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { CashTransaction } from "@/types/api";
import { formatMoney, toMinor } from "@/utils/decimal";

import { useCashTransaction } from "../hooks/useCashTransaction";
import {
  CASH_TRANSACTIONS_HREF,
  DIRECTION_TITLE,
  cashTransactionHref,
  DOCUMENT_TYPE_LABEL,
  RECORDED_VIA_LABEL,
  cashTransactionTitle,
  directionTitle,
  documentHref,
  formatDate,
  formatDateTime,
  hasLines,
  kindLabel,
  lockedReason,
} from "../labels";
import { CancelCashTransactionDialog } from "./CancelCashTransactionDialog";
import { CashTransactionJournalDialog } from "./CashTransactionJournalDialog";
import { CashTransactionStatusBadge } from "./CashTransactionStatusBadge";

/**
 * ONE TRANSACTION — what moved, where it went, and the entries behind it.
 *
 * UBAH AND BATALKAN LIVE HERE (D4), not in a void on the till or a reversal typed
 * into the ledger. Both post a reversing entry; an edit then posts a new one
 * under the SAME number, and the page keeps every earlier version under Riwayat
 * perubahan with both of its journal links, so nothing a report once showed
 * becomes untraceable.
 *
 * BOTH ARE HIDDEN, not disabled, on what cannot change: a cancelled transaction,
 * migrated history whose journal was never rebuilt, and a till refund — that one
 * belongs to its return. The reason is said in words where it is not obvious.
 */
export function CashTransactionDetail({
  transactionId,
}: {
  transactionId: string;
}) {
  const { transaction, loading, error, notFound, apply, refetch } =
    useCashTransaction(transactionId);
  const { can } = usePermissions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const mayReadLedger = can("journalEntries", "read");

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat transaksi…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Transaksi tidak ditemukan.</p>
        <Button variant="secondary" asChild>
          <Link href={CASH_TRANSACTIONS_HREF}>← Semua transaksi</Link>
        </Button>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">
          {error ?? "Gagal memuat transaksi. Coba lagi."}
        </Alert>
        <div>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  const title = cashTransactionTitle(transaction);
  const voided = transaction.status === "void";
  const locked = lockedReason(transaction);
  const hasMdr = (toMinor(transaction.mdrAmount) ?? 0n) > 0n;
  /*
    CASH AT THE TILL: what the customer handed over and the change they got back.
    `Jumlah` is what stayed in the drawer; these two are what a cashier checks a
    disputed receipt against. Only a cash line can give change, and only the till
    records the notes handed across — a back-office receipt has neither.
  */
  /*
    WHETHER THE ≡ MENU'S FIRST ITEM CAN DO ANYTHING. Off when the transaction has
    no entry of its own (migrated history) or when the reader may not open the
    ledger — the item is then DISABLED rather than absent, because a menu that
    changes shape per row is a menu people have to read every time.
  */
  const canReadJournal = mayReadLedger && Boolean(transaction.journalEntryId);

  const hasTender =
    transaction.recordedVia === "pos" &&
    transaction.channelType === "cash" &&
    transaction.tenderedAmount !== null &&
    transaction.tenderedAmount !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.cashBank,
              { label: title },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-extrabold text-foreground tabular-nums">
              {directionTitle(transaction)}
            </h1>
            {/*
              THE BADGE STAYS AT THE TOP, where the mockup has nothing — that
              data has no cancelled transactions and this system does. A page
              whose heading looks ordinary on a reversed transaction is the one
              mistake this screen cannot afford.
            */}
            <CashTransactionStatusBadge transaction={transaction} />
          </div>
          {/*
            THE AMOUNT, ONCE, IN THE HEADING. The mockup's detail card has no
            Jumlah because its Rincian Akun total carries it — but a payment
            against an invoice has no Rincian Akun card at all, and the figure
            cannot be the one thing a money document does not say out loud.
          */}
          <p
            className={cn(
              "mt-1 text-base font-bold tabular-nums",
              voided && "text-muted line-through",
            )}
          >
            {formatMoney(transaction.amount)}
          </p>
        </div>

        {!locked && (
          <div className="flex flex-wrap items-center gap-2">
            {/* A PAGE, NOT A DIALOG (20 September 2026, on request) — see
                CashTransactionEditScreen for why this form outgrew an overlay. */}
            <Can feature="cashTransactions" action="update">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`${cashTransactionHref(transaction._id)}/edit`}>
                  <Pencil className="size-4" />
                  Ubah
                </Link>
              </Button>
            </Can>

            {/*
              THE MOCKUP'S ≡ MENU, with the words this system can honour.
              "Hapus Transaksi" is not one of them: a posted transaction has a
              journal entry, and deleting the row would leave that entry pointing
              at nothing while every closed period quietly changed its answer.
              Cancelling posts a REVERSAL and keeps both halves readable, which
              is the same act somebody reaches for and the only one that is safe.
            */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Tindakan lain"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/*
                  A DIALOG, NOT A NAVIGATION. "Did this land on the right
                  accounts" is answered by four lines and a total, and leaving
                  the page to read them costs the thing being checked against.
                  The full entry is one more click away, on the number.
                */}
                <DropdownMenuItem
                  disabled={!canReadJournal}
                  onSelect={() => setJournalOpen(true)}
                >
                  <BookOpenText className="size-4" />
                  Lihat jurnal terkait
                </DropdownMenuItem>
                <Can feature="cashTransactions" action="void">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setCancelOpen(true)}
                  >
                    <Undo2 className="size-4" />
                    Batalkan transaksi
                  </DropdownMenuItem>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {locked && !voided && <Alert variant="info">{locked}</Alert>}

      {/*
        THE MOCKUP'S CARD, in its order and with its eight fields. Everything
        else a transaction knows about itself moved to Informasi lain below —
        nothing was dropped, and the first thing on the page is now the eight
        facts somebody opens it to check.
      */}
      <Card title="Detail transaksi">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="No. transaksi">
            <span className="font-semibold tabular-nums">
              {transaction.number ?? "Tanpa nomor"}
            </span>
          </Field>
          <Field label="Tipe">
            <Badge variant="outline">
              {DIRECTION_TITLE[transaction.direction]}
            </Badge>
          </Field>

          <Field label="Tanggal">
            <span className="tabular-nums">{formatDate(transaction.at)}</span>
          </Field>
          <Field label={transaction.direction === "in" ? "Pengirim" : "Penerima"}>
            {transaction.party?.name ?? "—"}
          </Field>

          {/*
            AKUN KAS/BANK IS THE FACT; the channel is how it got there and only
            some rows have one. Naming both where both exist keeps a till payment
            explicable — "1101 Kas, lewat QRIS Xendit" — without a second field
            that reads as empty on every transaction typed by hand.
          */}
          <Field label="Akun Kas/Bank">
            {transaction.cashAccountName ? (
              <>
                {transaction.cashAccountCode ? (
                  <span className="tabular-nums">
                    {transaction.cashAccountCode}{" "}
                  </span>
                ) : null}
                {transaction.cashAccountName}
                {transaction.channelName ? (
                  <span className="text-muted">
                    {" "}
                    · lewat {transaction.channelName}
                  </span>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Cabang">{transaction.branchName ?? "—"}</Field>

          {/*
            READ OFF THE ROWS, because that is the only place it is recorded: a
            line names its own business line, and one transaction can serve
            several. Summarised rather than invented — "Beberapa lini" is the
            honest answer where a single name would be a wrong one.
          */}
          <Field label="Lini usaha">{businessLineSummary(transaction)}</Field>
          <Field label="Biaya tetap">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Segera</Badge>
              <span className="text-muted">
                Penjadwal biaya berulang belum ada.
              </span>
            </span>
          </Field>

          <Field label="Deskripsi" className="sm:col-span-2">
            <span className="whitespace-pre-line">{transaction.note ?? "—"}</span>
          </Field>
        </dl>

        {voided && (
          <div className="mt-5 rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
            <p className="font-semibold">
              Dibatalkan{" "}
              <span className="tabular-nums">
                {formatDateTime(transaction.voidedAt)}
              </span>{" "}
              oleh {transaction.voidedByName ?? "pengguna terhapus"}
            </p>
            {transaction.voidReason && (
              <p className="mt-1">Alasan: {transaction.voidReason}</p>
            )}
            {transaction.reversalJournalEntryId && (
              <p className="mt-1 text-muted">
                Jurnal pembalik{" "}
                <JournalLink
                  id={transaction.reversalJournalEntryId}
                  number={transaction.reversalJournalEntryNumber}
                  linked={mayReadLedger}
                />
              </p>
            )}
          </div>
        )}
      </Card>

      {/*
        WHAT THE MOCKUP DOES NOT DRAW, kept rather than dropped. A reference
        number, the document a payment settled, the acquirer's cut, the notes
        handed across a counter and who recorded the thing are all facts
        somebody comes to this page for — just not the first eight.
      */}
      <Card title="Informasi lain">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Jenis">{kindLabel(transaction.kind)}</Field>
          <Field label="No. referensi">
            <span className="tabular-nums">{transaction.ref ?? "—"}</span>
          </Field>
          {transaction.document && (
            <Field label="Dokumen">
              <DocumentLink document={transaction.document} />
            </Field>
          )}
          {transaction.commission && (
            <Field label="Periode komisi">
              <span className="tabular-nums">
                {transaction.commission.periods.join(", ") || "—"}
              </span>{" "}
              <span className="text-muted">
                ({transaction.commission.recordCount} layanan)
              </span>
            </Field>
          )}
          {hasMdr && (
            <>
              <Field label="MDR">
                <span className="tabular-nums">
                  {formatMoney(transaction.mdrAmount)}
                </span>
              </Field>
              <Field label="Masuk bersih">
                <span className="tabular-nums">
                  {formatMoney(transaction.netAmount)}
                </span>
              </Field>
            </>
          )}
          {hasTender && (
            <>
              <Field label="Diserahkan">
                <span className="tabular-nums">
                  {formatMoney(transaction.tenderedAmount ?? "0")}
                </span>
              </Field>
              <Field label="Kembalian">
                <span className="tabular-nums">
                  {formatMoney(transaction.changeAmount ?? "0")}
                </span>
              </Field>
            </>
          )}
          <Field label="Dicatat oleh">
            {transaction.createdByName ?? "—"}{" "}
            <span className="text-muted tabular-nums">
              · {formatDateTime(transaction.createdAt)}
            </span>
          </Field>
          <Field label="Dicatat lewat">
            {RECORDED_VIA_LABEL[transaction.recordedVia] ??
              transaction.recordedVia}
          </Field>
        </dl>
      </Card>

      {hasLines(transaction.kind) && (transaction.lines?.length ?? 0) > 0 && (
        <LinesCard transaction={transaction} />
      )}

      {transaction.revisions.length > 0 && (
        <RevisionsCard transaction={transaction} mayReadLedger={mayReadLedger} />
      )}

      <CashTransactionJournalDialog
        open={journalOpen}
        transaction={transaction}
        onClose={() => setJournalOpen(false)}
      />

      <CancelCashTransactionDialog
        transaction={cancelOpen ? transaction : null}
        onClose={() => setCancelOpen(false)}
        onCancelled={apply}
      />
    </div>
  );
}

/**
 * THE TRANSACTION'S LINE OF BUSINESS, read off its rows — the only place one is
 * recorded.
 *
 * Three answers and they are genuinely different. One name when every row
 * agrees; "Bersama (HQ)" when they agree that none applies, which is a decision
 * somebody made and not a blank; and a count when they disagree, because a
 * transaction that paid for grooming AND retail has no single line and naming
 * the first of them would be a wrong answer wearing a right shape.
 */
function businessLineSummary(transaction: CashTransaction): string {
  const lines = transaction.lines ?? [];

  if (lines.length === 0) return "—";

  const ids = new Set(lines.map((line) => line.businessLineId ?? ""));

  if (ids.size > 1) return `${ids.size} lini`;

  const [line] = lines;
  return line.businessLineId
    ? (line.businessLineName ?? "—")
    : SHARED_LINE_LABEL;
}

function DocumentLink({
  document,
}: {
  document: NonNullable<CashTransaction["document"]>;
}) {
  const href = documentHref(document);
  const label = document.number ?? DOCUMENT_TYPE_LABEL[document.type];

  if (!href) {
    return (
      <span className="tabular-nums">
        {DOCUMENT_TYPE_LABEL[document.type]} {document.number ?? ""}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md bg-navy-100 px-3 py-1.5 font-semibold text-primary tabular-nums hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label} →
    </Link>
  );
}

/** What an expense became, or where other income came from — one row per account. */
function LinesCard({ transaction }: { transaction: CashTransaction }) {
  const lines = transaction.lines ?? [];
  /*
    The Detil Akun column appears only when something on THIS transaction has
    one. A column of em dashes over every row of every old transaction would
    teach people to ignore the column, and nothing posted before allocation
    existed carries a detil.
  */
  const anyAllocation = lines.some((line) => line.allocationId);

  return (
    // "Rincian Akun", the mockup's name, rather than one that changes with the
    // direction: the card is the same table either way, and a heading that moves
    // between two words is one more thing to read before the rows.
    <Card title="Rincian akun">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
              {anyAllocation && <TableHead>Detil akun</TableHead>}
              <TableHead>Lini bisnis</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={`${line.accountId}-${index}`}>
                <TableCell className="text-sm">
                  <span className="tabular-nums">{line.accountCode ?? ""}</span>{" "}
                  {line.accountName ?? "Akun tidak aktif"}
                </TableCell>
                {anyAllocation && (
                  <TableCell className="text-sm">
                    {/* The id rather than nothing when the rule cannot be named:
                        it is unreachable through the API (the chart refuses to
                        delete a rule an entry names) but it is what a direct
                        database edit would look like, and silence there would
                        read as "no detil". */}
                    {line.allocationName ?? (line.allocationId ? "—" : "")}
                  </TableCell>
                )}
                <TableCell className="text-sm">
                  {line.businessLineName ??
                    (line.businessLineId ? "—" : SHARED_LINE_LABEL)}
                </TableCell>
                <TableCell className="text-sm text-muted">
                  {line.memo ?? "—"}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(line.amount)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={anyAllocation ? 4 : 3}
                className="text-sm font-semibold"
              >
                Total
              </TableCell>
              <TableCell className="text-right text-sm font-bold tabular-nums">
                {formatMoney(transaction.amount)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/**
 * Every earlier version, oldest first — a correction reads as a sequence. Each
 * says what it looked like before and links both halves of its journal story:
 * the entry that stood, and the one that reversed it.
 */
function RevisionsCard({
  transaction,
  mayReadLedger,
}: {
  transaction: CashTransaction;
  mayReadLedger: boolean;
}) {
  return (
    <Card
      title="Riwayat perubahan"
      description="Nomor transaksi tidak berubah. Setiap perubahan membalik jurnal lama dan memposting yang baru."
    >
      <ol className="flex flex-col gap-4">
        {transaction.revisions.map((revision, index) => (
          <li
            key={`${revision.at}-${index}`}
            className="border-l-2 border-border pl-3 text-sm"
          >
            <p className="font-semibold">
              <span className="tabular-nums">{formatDateTime(revision.at)}</span>{" "}
              · {revision.byName ?? "pengguna terhapus"}
            </p>
            <p className="mt-0.5">
              Alasan: {revision.reason?.trim() ? revision.reason : "tidak diisi"}
            </p>
            <p className="mt-0.5 text-muted">
              Sebelumnya:{" "}
              <span className="tabular-nums">
                {formatDate(revision.before.at)} ·{" "}
                {formatMoney(revision.before.amount)}
              </span>{" "}
              ·{" "}
              {revision.before.cashAccountName ??
                revision.before.channelName ??
                "—"}
              {revision.before.ref ? (
                <>
                  {" "}
                  · Ref <span className="tabular-nums">{revision.before.ref}</span>
                </>
              ) : null}
              {revision.before.note ? ` · ${revision.before.note}` : null}
            </p>
            {(revision.journalEntryId || revision.reversalJournalEntryId) && (
              <p className="mt-0.5 text-muted">
                {revision.journalEntryId && (
                  <>
                    Jurnal lama{" "}
                    <JournalLink
                      id={revision.journalEntryId}
                      number={revision.journalEntryNumber}
                      linked={mayReadLedger}
                    />
                  </>
                )}
                {revision.reversalJournalEntryId && (
                  <>
                    {" "}
                    · dibalik oleh{" "}
                    <JournalLink
                      id={revision.reversalJournalEntryId}
                      number={revision.reversalJournalEntryNumber}
                      linked={mayReadLedger}
                    />
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
