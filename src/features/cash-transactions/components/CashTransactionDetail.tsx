"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Undo2 } from "lucide-react";

import { Alert, Breadcrumb, Card, JournalLink, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
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
  DIRECTION_LABEL,
  DOCUMENT_TYPE_LABEL,
  RECORDED_VIA_LABEL,
  cashTransactionTitle,
  documentHref,
  formatDate,
  formatDateTime,
  hasLines,
  kindLabel,
  lockedReason,
} from "../labels";
import { CancelCashTransactionDialog } from "./CancelCashTransactionDialog";
import { CashTransactionEditDialog } from "./CashTransactionEditDialog";
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
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
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
              ACCOUNTING_CRUMBS.transactions,
              { label: title },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-extrabold text-foreground tabular-nums">
              {title}
            </h1>
            <CashTransactionStatusBadge transaction={transaction} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {kindLabel(transaction.kind)} ·{" "}
            {DIRECTION_LABEL[transaction.direction]}{" "}
            <span className="tabular-nums">
              {formatMoney(transaction.amount)}
            </span>{" "}
            · <span className="tabular-nums">{formatDate(transaction.at)}</span>
          </p>
        </div>

        {!locked && (
          <div className="flex flex-wrap items-center gap-2">
            <Can feature="cashTransactions" action="update">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
                Ubah
              </Button>
            </Can>
            <Can feature="cashTransactions" action="void">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                <Undo2 className="size-4" />
                Batalkan transaksi
              </Button>
            </Can>
          </div>
        )}
      </div>

      {locked && !voided && <Alert variant="info">{locked}</Alert>}

      <Card title="Rincian transaksi">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Tanggal">
            <span className="tabular-nums">{formatDate(transaction.at)}</span>
          </Field>
          <Field label="Jenis">{kindLabel(transaction.kind)}</Field>
          <Field label="Arah">{DIRECTION_LABEL[transaction.direction]}</Field>
          <Field label="Cabang">{transaction.branchName ?? "—"}</Field>
          <Field label="Channel">{transaction.channelName ?? "—"}</Field>
          <Field label="Jumlah">
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                voided && "text-muted line-through",
              )}
            >
              {formatMoney(transaction.amount)}
            </span>
          </Field>
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
          <Field label="Pihak">{transaction.party?.name ?? "—"}</Field>
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
          <Field label="No. referensi">
            <span className="tabular-nums">{transaction.ref ?? "—"}</span>
          </Field>
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
          <Field label="Catatan" className="sm:col-span-2">
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

      {hasLines(transaction.kind) && (transaction.lines?.length ?? 0) > 0 && (
        <LinesCard transaction={transaction} />
      )}

      <Card
        title="Jurnal"
        description="Mengubah atau membatalkan transaksi membalik jurnalnya — jurnal lama tidak pernah disunting."
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label={voided ? "Jurnal" : "Jurnal berlaku"}>
            {transaction.journalEntryId ? (
              <JournalLink
                id={transaction.journalEntryId}
                number={transaction.journalEntryNumber}
                linked={mayReadLedger}
              />
            ) : (
              "—"
            )}
          </Field>
          {transaction.reversalJournalEntryId && (
            <Field label="Jurnal pembalik">
              <JournalLink
                id={transaction.reversalJournalEntryId}
                number={transaction.reversalJournalEntryNumber}
                linked={mayReadLedger}
              />
            </Field>
          )}
        </dl>
      </Card>

      {transaction.revisions.length > 0 && (
        <RevisionsCard transaction={transaction} mayReadLedger={mayReadLedger} />
      )}

      <CashTransactionEditDialog
        open={editOpen}
        transaction={transaction}
        onClose={() => setEditOpen(false)}
        onSaved={apply}
      />

      <CancelCashTransactionDialog
        transaction={cancelOpen ? transaction : null}
        onClose={() => setCancelOpen(false)}
        onCancelled={apply}
      />
    </div>
  );
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

  return (
    <Card title={transaction.kind === "expense" ? "Akun beban" : "Akun pendapatan"}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
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
              <TableCell colSpan={3} className="text-sm font-semibold">
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
              · {revision.before.channelName ?? "—"}
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
