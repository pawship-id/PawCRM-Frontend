"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Plus, RotateCcw } from "lucide-react";

import { Alert, HighlightText, ListFooter, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
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
import type { CashTransaction, CashTransactionSort } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import {
  CASH_TRANSACTION_PAGE_SIZES,
  type UseCashTransactionsResult,
} from "../hooks/useCashTransactions";
import {
  CASH_TRANSACTION_DETAIL_HREF,
  cashTransactionHref,
  documentHref,
  formatDate,
  hasLines,
  lockedReason,
  sourceLabel,
} from "../labels";
import { DEFAULT_CASH_TRANSACTION_STATUS } from "../query";
import { CashTransactionStatusBadge } from "./CashTransactionStatusBadge";
import { CashTransactionsToolbar } from "./CashTransactionsToolbar";

/** Tanggal · Deskripsi · Akun · Cabang · Jumlah · Akun Kas/Bank · Sumber. */
const COLUMN_COUNT = 7;

/**
 * THE THREE COLUMNS THE HEADER CAN ORDER BY, and only three.
 *
 * `CASH_TRANSACTION_SORTS` on the server is a closed set with an index behind
 * each entry. Deskripsi and Akun are NOT in it and are not clickable here: what
 * those two cells show is assembled from several fields and resolved live
 * against the chart, so any column the server could actually sort would put the
 * rows in an order that disagrees with the text somebody is reading. A header
 * that sorts by something other than what it displays is worse than one that
 * does not invite the click.
 */
const SORTABLE: Record<string, { asc: CashTransactionSort; desc: CashTransactionSort }> =
  {
    tanggal: { asc: "oldest", desc: "newest" },
    cabang: { asc: "branchAsc", desc: "branchDesc" },
    jumlah: { asc: "amountLowest", desc: "amountHighest" },
  };

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
 * CANCELLED ROWS ARE OUT OF THE LIST BY DEFAULT (20 September 2026), because
 * this is the list a drawer and a bank statement are reconciled against and a
 * row for money that never moved is a row somebody has to think past on every
 * pass. They are not deleted: `Status → Dibatalkan` or `Termasuk dibatalkan` in
 * the filter panel brings them back, still muted and struck through, and the
 * detail they link to is unchanged. The filter is SERVER-SIDE like every other
 * one here, so the pager and the cards agree with what the table shows.
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
    query.status !== DEFAULT_CASH_TRANSACTION_STATUS ||
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
                  <SortHead
                    column="tanggal"
                    label="Tanggal"
                    sort={query.sort}
                    onSort={(next) => setQuery({ sort: next, page: 1 })}
                  />
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>Akun</TableHead>
                  <SortHead
                    column="cabang"
                    label="Cabang"
                    sort={query.sort}
                    onSort={(next) => setQuery({ sort: next, page: 1 })}
                  />
                  <SortHead
                    column="jumlah"
                    label="Jumlah"
                    align="right"
                    sort={query.sort}
                    onSort={(next) => setQuery({ sort: next, page: 1 })}
                  />
                  <TableHead>Akun Kas/Bank</TableHead>
                  <TableHead>Sumber</TableHead>
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
                    onEdit={() =>
                      router.push(
                        `${cashTransactionHref(transaction._id)}/edit`,
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/*
            THE SHARED FOOTER since 20 September 2026 — the same one Faktur
            Penjualan carries. It replaced a bare `Pagination` beside a size
            control: that component draws nothing at all on a single page, and
            with this list's page size the single page is the ordinary case, so
            the position line and the size control used to vanish exactly when
            somebody wanted to ask for MORE rows.
          */}
          <ListFooter
            page={pagination.page}
            pageSize={query.limit}
            pageSizes={CASH_TRANSACTION_PAGE_SIZES}
            total={pagination.total}
            totalPages={pagination.totalPages}
            unit="transaksi"
            onPageChange={(page) => setQuery({ page })}
            onPageSizeChange={(limit) => setQuery({ limit, page: 1 })}
          />
        </>
      )}
    </div>
  );
}

/**
 * A COLUMN HEADER THAT ORDERS THE LIST — first click takes the column's natural
 * direction, second flips it.
 *
 * THE ARROW IS ON EVERY SORTABLE HEADER, greyed when that column is not the
 * active one, so the row says which columns can be clicked rather than only
 * which one is on. Same rule as Daftar Akun, where this pattern was first
 * decided (§8, 20 September 2026).
 */
function SortHead({
  column,
  label,
  align = "left",
  sort,
  onSort,
}: {
  column: keyof typeof SORTABLE;
  label: string;
  align?: "left" | "right";
  sort: CashTransactionSort;
  onSort: (next: CashTransactionSort) => void;
}) {
  const { asc, desc } = SORTABLE[column];
  const active = sort === asc ? "asc" : sort === desc ? "desc" : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active === "asc"
          ? "ascending"
          : active === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        type="button"
        // The first click takes `desc` on a date and an amount — the newest and
        // the largest are what somebody opening a cash book is looking for — and
        // `asc` on a name, where A is the top of the list.
        onClick={() => onSort(active === "desc" ? asc : desc)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon
          className={cn("size-3.5", active ? "text-primary" : "text-muted/60")}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

function TransactionRow({
  transaction,
  search,
  onOpen,
  onEdit,
}: {
  transaction: CashTransaction;
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const voided = transaction.status === "void";
  const masuk = transaction.direction === "in";

  /*
    A HIT THE COLUMNS DO NOT SHOW. The server's search also matches the
    reference, and a row that matched on it would otherwise sit in the filtered
    list with nothing yellow in it and no way to tell why.
  */
  const term = search.trim().toLowerCase();
  const hits = (value: string | null | undefined): value is string =>
    Boolean(term && value && value.toLowerCase().includes(term));

  /*
    THE DESCRIPTION, from the best thing the row has. A transaction typed by
    hand carries the words somebody wrote; a payment carries the document it
    settled; a migrated row has neither, and its kind is still an answer.
  */
  const description =
    transaction.note ?? transaction.document?.number ?? sourceLabel(transaction.kind);

  /*
    MANUAL ROWS CARRY A PENCIL, the rest a link to what owns them — which is the
    whole point of the Sumber column: it says whether this is yours to change or
    a consequence of a document somewhere else. `lockedReason` is the same test
    the edit dialog applies, so a pencil never opens onto a refusal.
  */
  const manual = hasLines(transaction.kind);
  const editable = manual && lockedReason(transaction) === null;
  const document = transaction.document;
  const href = document ? documentHref(document) : null;

  const counter = transaction.counterAccounts;

  return (
    <TableRow
      // The whole row opens the detail; the number is the keyboard's way in.
      onClick={onOpen}
      className={cn("cursor-pointer", voided && "text-muted")}
    >
      <TableCell className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">
        {formatDate(transaction.at)}
      </TableCell>

      <TableCell className="max-w-xs px-4 py-2.5">
        {/*
          THE BADGES THAT OUTLIVED THE STATUS COLUMN sit beside the description,
          not on a column of their own — and only when they have something to
          say. "Dibatalkan" because a struck-through row must still carry the
          WORD (§1.3), and "Kasir" because nothing else in the row says money was
          taken at the till: Sumber is keyed on the kind, so a payment reads
          "Pembayaran" whether a cashier took it or the back office typed it.
          `shrink-0` keeps them whole while the description truncates.
        */}
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm">
            <HighlightText text={description} query={search} />
          </p>
          <CashTransactionStatusBadge
            transaction={transaction}
            showPosted={false}
            className="shrink-0"
          />
        </div>
        {/*
          THE NUMBER AND THE PARTY ON ONE LINE UNDER IT. The bukti kas number
          lost its own column to Sumber and Akun; it keeps a link here because it
          is the keyboard's route into the detail and the thing somebody reads a
          number off a printed voucher to find.
        */}
        <p className="truncate text-xs text-muted">
          <Link
            href={cashTransactionHref(transaction._id)}
            onClick={(event) => event.stopPropagation()}
            className="rounded-md tabular-nums underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {transaction.number ? (
              <HighlightText text={transaction.number} query={search} />
            ) : (
              "Tanpa nomor"
            )}
          </Link>
          {transaction.party?.name && (
            <>
              {" · "}
              <HighlightText text={transaction.party.name} query={search} />
            </>
          )}
        </p>
        {hits(transaction.ref) && (
          <p className="truncate text-xs text-muted tabular-nums">
            <HighlightText text={`Ref. ${transaction.ref}`} query={search} />
          </p>
        )}
      </TableCell>

      {/*
        THE OTHER SIDE. One account is named; several are counted, because a
        column that printed the first of three would quietly misfile the rest.
      */}
      <TableCell className="max-w-44 px-4 py-2.5 text-sm">
        {counter.length === 0 ? (
          <span className="text-muted">—</span>
        ) : counter.length === 1 ? (
          <span className="truncate">{counter[0].name}</span>
        ) : (
          <span className="text-muted">{counter.length} akun</span>
        )}
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        {transaction.branchName ?? "—"}
      </TableCell>

      {/*
        ONE COLUMN, SIGNED — the mockup's shape. Green and a plus for money
        arriving; the sign carries the direction on its own, so the colour is
        never the only thing saying which way it went.
      */}
      <TableCell
        className={cn(
          "px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
          masuk && !voided && "text-success",
          voided && "line-through",
        )}
      >
        {masuk ? "+ " : "− "}
        {formatMoney(transaction.amount)}
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        {transaction.cashAccountName ?? "—"}
      </TableCell>

      <TableCell className="px-4 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {manual ? (
            <Badge variant="outline">Manual</Badge>
          ) : href ? (
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              className="rounded-md text-sm font-medium underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {sourceLabel(transaction.kind)}
              {document?.number ? ` · ${document.number}` : ""}
            </Link>
          ) : (
            <span className="text-sm">{sourceLabel(transaction.kind)}</span>
          )}

          {editable && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Ubah ${transaction.number ?? "transaksi"}`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="size-4" />
            </Button>
          )}
        </span>
      </TableCell>

    </TableRow>
  );
}
