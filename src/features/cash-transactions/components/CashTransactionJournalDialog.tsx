"use client";

import Link from "next/link";

import { Alert, Spinner } from "@/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJournalEntry } from "@/features/accounting";
import type { CashTransaction } from "@/types/api";
import { formatMoney, isPositive, sumDecimals } from "@/utils/decimal";

import { cashTransactionTitle, formatDate } from "../labels";

/**
 * JURNAL TERKAIT — the entry a transaction posted, read without leaving it.
 *
 * WHY A DIALOG AND NOT JUST THE LINK it replaced. The question somebody asks
 * here is "did this land on the right accounts", which is answered by four lines
 * and a total; navigating to the ledger to read them costs the page they were
 * checking against, and coming back costs it again. The full entry — its
 * reversal banners, its per-line business lines, its source document — is still
 * one click away, and THE NUMBER IS THAT CLICK.
 *
 * THE LINES ARE NOT ON THE TRANSACTION. `journalEntryId` is, so the entry is
 * fetched when the dialog opens and not before: most visits to a transaction
 * never ask this question, and a read of the ledger on every page load would be
 * a request nobody wanted.
 */
export function CashTransactionJournalDialog({
  open,
  transaction,
  onClose,
}: {
  open: boolean;
  transaction: CashTransaction;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {/* Mounted only while open, so the fetch follows the dialog. */}
        {open && <Body transaction={transaction} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ transaction }: { transaction: CashTransaction }) {
  const entryId = transaction.journalEntryId ?? "";
  const { entry, accountsById, loading, notFound, error } =
    useJournalEntry(entryId);

  const number = entry?.entryNumber ?? transaction.journalEntryNumber;
  const href = `/dashboard/keuangan/journal-entries/${entryId}`;

  const totalDebit = sumDecimals((entry?.lines ?? []).map((line) => line.debit));
  const totalCredit = sumDecimals(
    (entry?.lines ?? []).map((line) => line.credit),
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Jurnal terkait</DialogTitle>
        <DialogDescription>
          {/*
            THE NUMBER IS THE WAY OUT of this dialog and into the ledger — the
            one thing here that is a link, because it is the one thing that has
            more to say than the four lines below.
          */}
          <Link
            href={href}
            className="rounded-md font-semibold text-primary tabular-nums underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {number ?? "Lihat jurnal"}
          </Link>
          {" · "}
          <span className="tabular-nums">
            {cashTransactionTitle(transaction)}
          </span>
          {" · "}
          <span className="tabular-nums">{formatDate(transaction.at)}</span>
        </DialogDescription>
      </DialogHeader>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Spinner /> Memuat jurnal…
        </div>
      )}

      {!loading && notFound && (
        <Alert variant="info">
          Jurnalnya tidak ditemukan. Transaksi ini mungkin hasil migrasi yang
          jurnalnya tidak dibentuk ulang.
        </Alert>
      )}

      {!loading && !notFound && error && <Alert variant="error">{error}</Alert>}

      {!loading && entry && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines.map((line, index) => {
                  const account = accountsById.get(line.accountId);
                  const isDebit = isPositive(line.debit);

                  return (
                    <TableRow key={`${line.accountId}-${index}`}>
                      <TableCell className="text-sm">
                        {/*
                          The id when the chart could not be read — a reader who
                          holds `journalEntries:read` and not
                          `chartOfAccounts:read` still gets the amounts and the
                          balance, which is most of the answer.
                        */}
                        <span className="tabular-nums">
                          {account ? `${account.code} ` : ""}
                        </span>
                        {account?.name ?? line.accountId}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {isDebit ? formatMoney(line.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {isDebit ? "—" : formatMoney(line.credit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-right text-sm font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {formatMoney(totalDebit)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {formatMoney(totalCredit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <p className="text-sm text-muted">
            Baris jurnal ini diposting otomatis saat transaksi disimpan —
            mengikuti sisi debit/kredit yang sama seperti tab Jurnal.
          </p>
        </>
      )}
    </>
  );
}
