"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Plus,
  RotateCcw,
} from "lucide-react";

import { Alert, Card, ListFooter, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { JournalEntry, JournalEntrySort } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { reportPresets, type FinanceQuery } from "../financeSummary";
import {
  JOURNAL_PAGE_SIZES,
  useJournalEntries,
} from "../hooks/useJournalEntries";
import { formatDate, sourceLabel, SOURCE_TONE } from "../labels";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import { FinanceReportToolbar } from "./FinanceReportToolbar";
import { JournalEntriesToolbar } from "./JournalEntriesToolbar";

/** Tanggal, No. jurnal, Keterangan, Sumber, Cabang, Nilai, Status. */
const COLUMN_COUNT = 7;

/**
 * The column headers that order the list, and which way each goes FIRST.
 *
 * Newest and largest first on a date and an amount — what somebody opening a
 * ledger is looking for — and A first on a name or a number, where the top of
 * the alphabet is the top of the list. Every ordering here is one the server
 * sorts by the same text the cell shows; SUMBER IS NOT SORTABLE because the cell
 * shows a label ("Faktur", "Jurnal manual") while the server could only order by
 * the code behind it, and a header that sorts by something other than what it
 * displays is worse than one that does not invite the click (the rule Kas &
 * Bank's list set on 20 September).
 */
const SORTABLE = {
  tanggal: { first: "newest", then: "oldest" },
  nomor: { first: "numberAsc", then: "numberDesc" },
  keterangan: { first: "descriptionAsc", then: "descriptionDesc" },
  cabang: { first: "branchAsc", then: "branchDesc" },
  nilai: { first: "totalDesc", then: "totalAsc" },
} as const satisfies Record<
  string,
  { first: JournalEntrySort; then: JournalEntrySort }
>;

/**
 * JURNAL — every financial fact in the tenant, as the mockup lays it out
 * (21 September 2026): the module's context bar (Cabang, Periode), then one card
 * holding the search, a Sumber filter, a table whose headers order it, and the
 * shared footer with its page-size control.
 *
 * WHAT WENT, AND WHY IT COULD: the month group headers and the Entri / Total
 * debit tiles. The month headers carried a subtotal that could only ever cover
 * the page, and the tiles restated a total the dashboard already owns; the
 * mockup has neither. The Nilai column is now sortable instead, off the stored
 * `total`.
 *
 * WHAT STAYED THOUGH THE MOCKUP LACKS IT: the Status column. The mockup's data
 * never reverses an entry; the ledger does, and "dibalik" on a row whose amounts
 * no longer reach any report is the most important thing on it. Hiding it would
 * make one transaction look recorded twice. Same call Kas & Bank made.
 *
 * NO LINI USAHA ON THE BAR. An entry is not IN a line of business — its lines
 * are, and a shared cost is split across several by the laba rugi rather than
 * stamped with one. Filtering entries by lini would show some of what a line
 * carried and hide the rest, so the control is left out rather than offered
 * half-true, as it is on Kas & Bank and Arus Kas.
 *
 * NO EDIT ACTION ANYWHERE. A posted entry is immutable; a wrong one is reversed.
 */
export function JournalEntriesScreen({ now }: { now: string }) {
  const router = useRouter();
  const today = useMemo(() => new Date(now), [now]);
  const presets = useMemo(() => reportPresets(today), [today]);

  const {
    entries,
    pagination,
    query,
    branches,
    loading,
    error,
    setQuery,
    refetch,
  } = useJournalEntries();

  const filtered =
    query.search.trim() !== "" ||
    query.sourceType !== "" ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.branchId !== "";

  // The bar speaks `FinanceQuery`; this page's state carries three of its
  // fields. Translated here so the bar stays one component across Keuangan.
  const contextQuery: FinanceQuery = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    branchId: query.branchId,
    businessLineId: "",
  };

  const sortHead = (
    column: keyof typeof SORTABLE,
    label: string,
    align?: "right",
  ) => (
    <SortHead
      column={column}
      label={label}
      align={align}
      sort={query.sort}
      onSort={(sort) => setQuery({ sort })}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader
        action={
          /*
            THE ONE WRITABLE ACTION, in the page head where the mockup puts it.
            POST /journal-entries only ever produces a MANUAL entry — every other
            source posts service-to-service — so this is the only "new" that
            means anything on the ledger, and it is named for what it makes.
          */
          <Can feature="journalEntries" action="create">
            <Button asChild>
              <Link href={`${ACCOUNTING_CRUMBS.journal.href}/new`}>
                <Plus className="size-4" />
                Tambah jurnal manual
              </Link>
            </Button>
          </Can>
        }
      />

      <FinanceReportToolbar
        query={contextQuery}
        branches={branches}
        presets={presets}
        disabled={loading}
        onChange={(patch: Partial<FinanceQuery>) =>
          setQuery({
            ...(patch.dateFrom !== undefined && { dateFrom: patch.dateFrom }),
            ...(patch.dateTo !== undefined && { dateTo: patch.dateTo }),
            ...(patch.branchId !== undefined && { branchId: patch.branchId }),
          })
        }
      />

      <Card>
        <div className="flex flex-col gap-4">
          {/* The module's small caption rather than the Card's `title` — the
              mockup's "JURNAL UMUM", and Kas & Bank's "Daftar transaksi". */}
          <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Jurnal umum
          </h2>

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

          <JournalEntriesToolbar query={query} onChange={setQuery} />

          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Spinner /> Memuat jurnal…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <Table className={loading ? "opacity-60" : undefined}>
                  <TableHeader>
                    <TableRow>
                      {sortHead("tanggal", "Tanggal")}
                      {sortHead("nomor", "No. jurnal")}
                      {sortHead("keterangan", "Keterangan")}
                      <TableHead>Sumber</TableHead>
                      {sortHead("cabang", "Cabang")}
                      {sortHead("nilai", "Nilai", "right")}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={COLUMN_COUNT}
                          className="px-4 py-16 text-center"
                        >
                          <p className="font-medium text-foreground">
                            {filtered
                              ? "Tidak ada entri di filter ini."
                              : "Belum ada entri jurnal."}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {filtered
                              ? "Coba longgarkan periode, cabang atau sumbernya, atau hapus kata kuncinya."
                              : "Entri muncul begitu ada transaksi yang diposting — penjualan, penerimaan barang, atau opname."}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}

                    {entries.map((entry) => (
                      <TableRow
                        key={entry._id}
                        // The whole row opens the entry, as the mockup's does;
                        // the number stays a real link for the keyboard and for
                        // opening in a new tab.
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`,
                          )
                        }
                      >
                        <TableCell className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Link
                            href={`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-md text-sm font-semibold tabular-nums text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {entry.entryNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-md px-4 py-2.5">
                          <p className="truncate text-sm font-medium">
                            {entry.description}
                          </p>
                          {entry.source.reference && (
                            <p className="truncate text-xs tabular-nums text-muted">
                              {entry.source.reference}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                              SOURCE_TONE[entry.source.type],
                            )}
                          >
                            {sourceLabel(entry.source.type)}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap text-muted">
                          {entry.branchName ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                          {formatMoney(entryTotal(entry))}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge entry={entry} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ListFooter
                page={pagination.page}
                pageSize={query.limit}
                pageSizes={JOURNAL_PAGE_SIZES}
                total={pagination.total}
                totalPages={pagination.totalPages}
                unit="entri"
                onPageChange={(page) => setQuery({ page })}
                onPageSizeChange={(limit) => setQuery({ limit })}
              />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * The entry's amount — Σdebit, equal to Σcredit by definition.
 *
 * The stored `total` when the server has one (it is what the Nilai column
 * sorts by, so showing it keeps the order and the figures in agreement), and
 * the lines' own sum for an entry the backfill has not reached.
 */
export function entryTotal(entry: JournalEntry): string {
  return entry.total ?? sumDecimals(entry.lines.map((line) => line.debit));
}

/**
 * A COLUMN HEADER THAT ORDERS THE LIST — first click takes the column's natural
 * direction (SORTABLE above), a second flips it. The arrow is on every sortable
 * header, greyed when that column is not the active one, so the row says which
 * columns can be clicked — the rule Daftar Akun and Kas & Bank follow.
 */
function SortHead({
  column,
  label,
  align,
  sort,
  onSort,
}: {
  column: keyof typeof SORTABLE;
  label: string;
  align?: "right";
  sort: JournalEntrySort;
  onSort: (next: JournalEntrySort) => void;
}) {
  const { first, then } = SORTABLE[column];
  const active = sort === first ? "first" : sort === then ? "then" : null;
  // Which way the active ordering runs, for the arrow and for aria-sort.
  const ascending = sort === "oldest" || sort.endsWith("Asc");
  const Icon = !active ? ChevronsUpDown : ascending ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={!active ? "none" : ascending ? "ascending" : "descending"}
    >
      <button
        type="button"
        onClick={() => onSort(active === "first" ? then : first)}
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

/**
 * Where an entry sits in the correction story: an ordinary posting, one that has
 * been undone, or the entry that undid one. Always a word, never the colour
 * alone (§9).
 */
function StatusBadge({ entry }: { entry: JournalEntry }) {
  if (entry.reversedByEntryId) {
    return (
      <span
        className="rounded-full bg-tint-danger px-2 py-0.5 text-xs font-medium text-danger"
        title="Sudah dikoreksi oleh jurnal pembalik. Angkanya tidak lagi berpengaruh ke laporan."
      >
        dibalik
      </span>
    );
  }

  if (entry.reversesEntryId) {
    return (
      <span
        className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        title="Entri pembalik — dibuat untuk membatalkan entri lain."
      >
        pembalik
      </span>
    );
  }

  return (
    <span className="rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success">
      diposting
    </span>
  );
}
