"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  HighlightText,
  Pagination,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { CashTransaction } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import type { UseCashTransactionsResult } from "../hooks/useCashTransactions";
import {
  CASH_TRANSACTION_DETAIL_HREF,
  cashTransactionHref,
  formatDate,
  kindLabel,
} from "../labels";
import { CashTransactionStatusBadge } from "./CashTransactionStatusBadge";
import { CashTransactionsToolbar } from "./CashTransactionsToolbar";

/** Tanggal · No. · Jenis · Pihak / Dokumen · Akun Kas/Bank · Masuk · Keluar · Status. */
const COLUMN_COUNT = 8;

/**
 * TRANSAKSI KEUANGAN — every numbered movement of money in one list: receipts
 * against invoices (from the back office and the till), supplier and commission
 * payments, expenses and other income.
 *
 * NOT THE LEDGER. Jurnal Umum answers "what did the books record"; this answers
 * "what money moved, out of which account, under which bukti number" — the
 * list a shop reconciles a bank statement or a cash drawer against. Every row
 * has a journal entry behind it, one click away on its detail.
 *
 * THE TWO CARDS COVER THE WHOLE FILTER, posted only, and come in the same
 * response as the rows — a cancelled transaction moved no money, and a card
 * that summed the page would be a wrong number wearing a right label.
 *
 * A CANCELLED ROW STAYS, muted and struck through. It posted an entry and a
 * reversal, and a list that hid it would leave both pointing at nothing.
 */
export function CashTransactionsPanel({
  state,
}: {
  /** The whole of `useCashTransactions`, owned by the page above. */
  state: UseCashTransactionsResult;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const {
    transactions,
    pagination,
    query,
    cashAccounts,
    loading,
    error,
    setQuery,
    refetch,
  } = state;

  const filtered =
    query.search.trim() !== "" ||
    query.direction !== "" ||
    query.kinds.length > 0 ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.branchId !== "" ||
    query.accountId !== "" ||
    query.status !== "" ||
    query.documentId !== "";

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <CashTransactionsToolbar
          query={query}
          cashAccounts={cashAccounts}
          onChange={setQuery}
          className="min-w-0 flex-1"
        />
        <Can feature="cashTransactions" action="create">
          <Button asChild>
            <Link href={`${CASH_TRANSACTION_DETAIL_HREF}/new`}>
              <Plus className="size-4" />
              Tambah transaksi
            </Link>
          </Button>
        </Can>
      </div>

      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat transaksi…
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <Table className={loading ? "opacity-60" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No.</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Pihak / Dokumen</TableHead>
                  <TableHead>Akun Kas/Bank</TableHead>
                  <TableHead className="text-right">Masuk</TableHead>
                  <TableHead className="text-right">Keluar</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="px-4 py-16 text-center"
                    >
                      <p className="font-medium text-foreground">
                        {filtered
                          ? "Tidak ada transaksi di filter ini."
                          : "Belum ada transaksi keuangan."}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {filtered ? (
                          "Coba longgarkan periode atau jenisnya, atau hapus kata kuncinya."
                        ) : can("cashTransactions", "create") ? (
                          <Link
                            href={`${CASH_TRANSACTION_DETAIL_HREF}/new`}
                            className="rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            Catat yang pertama →
                          </Link>
                        ) : (
                          "Transaksi muncul begitu ada pembayaran atau pengeluaran yang dicatat."
                        )}
                      </p>
                    </TableCell>
                  </TableRow>
                )}

                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction._id}
                    transaction={transaction}
                    search={query.search}
                    onOpen={() =>
                      router.push(cashTransactionHref(transaction._id))
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="transaksi"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  search,
  onOpen,
}: {
  transaction: CashTransaction;
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
  onOpen: () => void;
}) {
  const voided = transaction.status === "void";

  /*
    A HIT THE COLUMNS DO NOT SHOW. The server's search also matches the
    reference and the note, and the note is hidden behind the document number
    when there is one — a row that matched on either would sit in the filtered
    list with nothing yellow in it, and no way to tell why. So the matching
    field is surfaced as an extra line, highlighted like the rest.
  */
  const term = search.trim().toLowerCase();
  const hits = (value: string | null | undefined): value is string =>
    Boolean(term && value && value.toLowerCase().includes(term));
  const secondLine = transaction.document?.number ?? transaction.note;
  const hiddenHits = [
    transaction.document?.number && hits(transaction.note)
      ? transaction.note
      : null,
    hits(transaction.ref) ? `Ref. ${transaction.ref}` : null,
  ].filter((line): line is string => Boolean(line));
  const amount = (
    <span className={cn(voided && "line-through")}>
      {formatMoney(transaction.amount)}
    </span>
  );

  return (
    <TableRow
      // The whole row opens the detail; the number is the keyboard's way in.
      onClick={onOpen}
      className={cn("cursor-pointer", voided && "text-muted")}
    >
      <TableCell className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">
        {formatDate(transaction.at)}
      </TableCell>
      <TableCell className="px-4 py-2.5">
        <Link
          href={cashTransactionHref(transaction._id)}
          onClick={(event) => event.stopPropagation()}
          className="rounded-md text-sm font-medium whitespace-nowrap tabular-nums underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {transaction.number ? (
            <HighlightText text={transaction.number} query={search} />
          ) : (
            "Tanpa nomor"
          )}
        </Link>
      </TableCell>
      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        {kindLabel(transaction.kind)}
      </TableCell>
      <TableCell className="max-w-xs px-4 py-2.5">
        <p className="truncate text-sm">
          {transaction.party?.name ? (
            <HighlightText text={transaction.party.name} query={search} />
          ) : (
            "—"
          )}
        </p>
        {secondLine && (
          <p className="truncate text-xs text-muted tabular-nums">
            <HighlightText text={secondLine} query={search} />
          </p>
        )}
        {hiddenHits.map((line) => (
          <p key={line} className="truncate text-xs text-muted tabular-nums">
            <HighlightText text={line} query={search} />
          </p>
        ))}
      </TableCell>
      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        {transaction.cashAccountName ?? "—"}
      </TableCell>
      <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
        {transaction.direction === "in" ? amount : ""}
      </TableCell>
      <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
        {transaction.direction === "out" ? amount : ""}
      </TableCell>
      <TableCell className="px-4 py-2.5">
        <CashTransactionStatusBadge transaction={transaction} />
      </TableCell>
    </TableRow>
  );
}

