"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  HighlightText,
  Pagination,
  Spinner,
  StatTile,
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
import { AccountingModuleHeader } from "@/features/accounting";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { CashTransaction, CashTransactionTotals } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { useCashTransactions } from "../hooks/useCashTransactions";
import type { CashTransactionsQuery } from "../query";
import {
  CASH_TRANSACTIONS_HREF,
  cashTransactionHref,
  formatDate,
  kindLabel,
} from "../labels";
import { CashTransactionStatusBadge } from "./CashTransactionStatusBadge";
import { CashTransactionsToolbar } from "./CashTransactionsToolbar";

/** Tanggal · No. · Jenis · Pihak / Dokumen · Channel · Masuk · Keluar · Status. */
const COLUMN_COUNT = 8;

/**
 * TRANSAKSI KEUANGAN — every numbered movement of money in one list: receipts
 * against invoices (from the back office and the till), supplier and commission
 * payments, expenses and other income.
 *
 * NOT THE LEDGER. Jurnal Umum answers "what did the books record"; this answers
 * "what money moved, through which channel, under which bukti number" — the
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
export function CashTransactionsScreen({
  initialQuery,
}: {
  /** From the URL — see `cashTransactionsQueryFromParams`. */
  initialQuery?: Partial<CashTransactionsQuery>;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const {
    transactions,
    pagination,
    totals,
    query,
    branches,
    channels,
    loading,
    error,
    setQuery,
    refetch,
  } = useCashTransactions(initialQuery);

  const filtered =
    query.search.trim() !== "" ||
    query.direction !== "" ||
    query.kinds.length > 0 ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.branchId !== "" ||
    query.channelId !== "" ||
    query.status !== "" ||
    query.documentId !== "";

  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader
        action={
          <Can feature="cashTransactions" action="create">
            <Button asChild>
              <Link href={`${CASH_TRANSACTIONS_HREF}/new`}>
                <Plus className="size-4" />
                Catat transaksi
              </Link>
            </Button>
          </Can>
        }
      />

      <p className="max-w-2xl text-[15px] text-muted">
        Semua uang masuk dan keluar yang bernomor — penerimaan piutang,
        pembayaran supplier dan komisi, pembayaran di kasir, pengeluaran dan
        pemasukan lain. Yang salah bisa diubah atau dibatalkan dari detailnya;
        jurnalnya dibalik, tidak pernah dihapus.
      </p>

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

      <div className="grid gap-3 sm:grid-cols-2">
        <TotalTile label="Uang masuk" side="in" totals={totals} error={!!error} />
        <TotalTile label="Uang keluar" side="out" totals={totals} error={!!error} />
      </div>

      <CashTransactionsToolbar
        query={query}
        branches={branches}
        channels={channels}
        onChange={setQuery}
      />

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
                  <TableHead>Channel</TableHead>
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
                            href={`${CASH_TRANSACTIONS_HREF}/new`}
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
        {transaction.channelName ?? "—"}
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

function TotalTile({
  label,
  side,
  totals,
  error,
}: {
  label: string;
  side: "in" | "out";
  totals: CashTransactionTotals | null;
  error: boolean;
}) {
  const figure = totals?.[side];

  return (
    <StatTile
      label={label}
      value={figure ? formatMoney(figure.amount) : "—"}
      caption={
        figure
          ? `${figure.count} transaksi · seluruh filter, tanpa yang dibatalkan`
          : undefined
      }
      loading={!figure && !error}
      error={error}
    />
  );
}
