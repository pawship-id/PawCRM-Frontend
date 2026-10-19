"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  HighlightText,
  ListFooter,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/**
 * THE TWO COLUMNS THE HEADER CAN ORDER BY, and only two.
 *
 * `CASH_TRANSACTION_SORTS` on the server is a closed set with an index behind
 * each entry. Deskripsi and Akun are NOT in it and are not clickable here: what
 * those two cells show is assembled from several fields and resolved live
 * against the chart, so any column the server could actually sort would put the
 * rows in an order that disagrees with the text somebody is reading. A header
 * that sorts by something other than what it displays is worse than one that
 * does not invite the click. Cabang stopped sorting on BO's call (20 October
 * 2026), and the server dropped its two orderings with it.
 *
 * The first click takes `desc` on both — the newest and the largest are what
 * somebody opening a cash book is looking for.
 */
const SORT_OPTIONS: SortOptions<CashTransactionSort> = {
  tanggal: { asc: "oldest", desc: "newest", first: "desc" },
  jumlah: { asc: "amountLowest", desc: "amountHighest", first: "desc" },
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
    query.source !== "" ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.branchIds.length > 0 ||
    query.accountId !== "" ||
    query.status !== DEFAULT_CASH_TRANSACTION_STATUS ||
    query.documentId !== "";

  return (
    /*
      ONE CARD HOLDS THE WHOLE LIST — caption, controls, table and footer
      (20 September 2026, on request, from a mockup). They used to be loose
      siblings on the page, which left the table's own bordered box floating
      under an unattached toolbar; a reader had to infer that the search box
      belonged to the rows below it.

      THE STACK IS AN INNER DIV, not the Card itself: `Card` hands every child to
      one `CardContent`, which is a plain padded box — a gap set on the Card's
      root would be the space between its header slot and that box, and this
      card has no header slot.
    */
    <Card>
      <div className="flex flex-col gap-4">
        {/*
          A REAL HEADING, not the Card's `title` prop. `h2` because
          `PageHeading` owns the `h1` above and the tab row sits between them —
          somebody navigating by headings should land here rather than in a run
          of untitled boxes. Sentence case at the §5 section-heading size since
          20 October 2026 (BO); it was a small letter-spaced uppercase caption.
        */}
        <h2 className="text-lg font-bold">Daftar transaksi</h2>

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

        {/*
        TAMBAH TRANSAKSI RIDES THE BAR'S `actions` SLOT, so it sits on the search
        row level with `Filter (n)` (20 September 2026, on request). It used to
        be a sibling of the whole toolbar in an `items-start` flex, which pinned
        it to the TOP — beside the Tipe pills, a row it has nothing to do with.
      */}
        <CashTransactionsToolbar
          query={query}
          cashAccounts={cashAccounts}
          onChange={setQuery}
          actions={
            <Can feature="cashTransactions" action="create">
              <Button asChild>
                <Link href={`${CASH_TRANSACTION_DETAIL_HREF}/new`}>
                  <Plus className="size-4" />
                  Tambah transaksi
                </Link>
              </Button>
            </Can>
          }
        />

        <DataTable
          columns={transactionColumns({
            search: query.search,
            onEdit: (transaction) =>
              router.push(`${cashTransactionHref(transaction._id)}/edit`),
          })}
          rows={transactions}
          rowKey={(transaction) => transaction._id}
          sort={{
            value: query.sort,
            options: SORT_OPTIONS,
            onChange: (next) => setQuery({ sort: next, page: 1 }),
          }}
          loading={loading}
          loadingLabel="Memuat transaksi…"
          // The whole row opens the detail; the number is the keyboard's way in.
          onRowClick={(transaction) =>
            router.push(cashTransactionHref(transaction._id))
          }
          rowClassName={(transaction) =>
            transaction.status === "void" && "text-muted"
          }
          empty={
            <div className="px-4 py-16 text-center">
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
            </div>
          }
        />

        {/* The footer waits for the first rows, as it always has. */}
        {!(loading && transactions.length === 0) && (
          <>
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
    </Card>
  );
}

/**
 * Tanggal · Deskripsi · Akun · Cabang · Jumlah · Akun Kas/Bank · Sumber — the
 * mockup's columns.
 */
function transactionColumns({
  search,
  onEdit,
}: {
  /** Echoed into HighlightText so a hit explains itself. */
  search: string;
  onEdit: (transaction: CashTransaction) => void;
}): DataTableColumn<CashTransaction>[] {
  /*
    A HIT THE COLUMNS DO NOT SHOW. The server's search also matches the
    reference, and a row that matched on it would otherwise sit in the filtered
    list with nothing yellow in it and no way to tell why.
  */
  const term = search.trim().toLowerCase();
  const hits = (value: string | null | undefined): value is string =>
    Boolean(term && value && value.toLowerCase().includes(term));

  return [
    {
      id: "tanggal",
      header: "Tanggal",
      cellClassName: "px-4 py-2.5 text-sm tabular-nums whitespace-nowrap",
      cell: (transaction) => formatDate(transaction.at),
    },
    {
      id: "deskripsi",
      header: "Deskripsi",
      cellClassName: "max-w-xs px-4 py-2.5",
      cell: (transaction) => {
        /*
          THE DESCRIPTION, from the best thing the row has. A transaction typed
          by hand carries the words somebody wrote; a payment carries the
          document it settled; a migrated row has neither, and its kind is
          still an answer.
        */
        const description =
          transaction.note ??
          transaction.document?.number ??
          sourceLabel(transaction.kind);

        return (
          <>
            {/*
              THE BADGES THAT OUTLIVED THE STATUS COLUMN sit beside the
              description, not on a column of their own — and only when they
              have something to say. "Dibatalkan" because a struck-through row
              must still carry the WORD (§1.3), and "Kasir" because nothing else
              in the row says money was taken at the till: Sumber is keyed on
              the kind, so a payment reads "Pembayaran" whether a cashier took
              it or the back office typed it. `shrink-0` keeps them whole while
              the description truncates.
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
              THE NUMBER AND THE PARTY ON ONE LINE UNDER IT. The bukti kas
              number lost its own column to Sumber and Akun; it keeps a link
              here because it is the keyboard's route into the detail and the
              thing somebody reads a number off a printed voucher to find.
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
                <HighlightText
                  text={`Ref. ${transaction.ref}`}
                  query={search}
                />
              </p>
            )}
          </>
        );
      },
    },
    {
      /*
        THE OTHER SIDE. One account is named; several are counted, because a
        column that printed the first of three would quietly misfile the rest.
      */
      id: "akun",
      header: "Akun",
      cellClassName: "max-w-44 px-4 py-2.5 text-sm",
      cell: ({ counterAccounts: counter }) =>
        counter.length === 0 ? (
          <span className="text-muted">—</span>
        ) : counter.length === 1 ? (
          <span className="truncate">{counter[0].name}</span>
        ) : (
          <span className="text-muted">{counter.length} akun</span>
        ),
    },
    {
      id: "cabang",
      header: "Cabang",
      cellClassName: "px-4 py-2.5 text-sm whitespace-nowrap",
      cell: (transaction) => transaction.branchName ?? "—",
    },
    {
      /*
        ONE COLUMN, SIGNED — the mockup's shape. Green and a plus for money
        arriving; the sign carries the direction on its own, so the colour is
        never the only thing saying which way it went.
      */
      id: "jumlah",
      header: "Jumlah",
      align: "right",
      cellClassName: (transaction) => {
        const voided = transaction.status === "void";
        return cn(
          "px-4 py-2.5 text-sm font-semibold whitespace-nowrap",
          transaction.direction === "in" && !voided && "text-success",
          voided && "line-through",
        );
      },
      cell: (transaction) => (
        <>
          {transaction.direction === "in" ? "+ " : "− "}
          {formatMoney(transaction.amount)}
        </>
      ),
    },
    {
      id: "akunKas",
      header: "Akun Kas/Bank",
      cellClassName: "px-4 py-2.5 text-sm whitespace-nowrap",
      cell: (transaction) => transaction.cashAccountName ?? "—",
    },
    {
      id: "sumber",
      header: "Sumber",
      cellClassName: "px-4 py-2.5 whitespace-nowrap",
      cell: (transaction) => {
        /*
          MANUAL ROWS CARRY A PENCIL, the rest a link to what owns them — which
          is the whole point of the Sumber column: it says whether this is
          yours to change or a consequence of a document somewhere else.
          `lockedReason` is the same test the edit dialog applies, so a pencil
          never opens onto a refusal.
        */
        const manual = hasLines(transaction.kind);
        const editable = manual && lockedReason(transaction) === null;
        const document = transaction.document;
        const href = document ? documentHref(document) : null;

        return (
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
                  onEdit(transaction);
                }}
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </span>
        );
      },
    },
  ];
}
