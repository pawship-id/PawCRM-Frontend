"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FinanceScopeCard,
  ListFooter,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { JournalEntry, JournalEntrySort } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { reportPresets } from "../financeSummary";
import {
  JOURNAL_PAGE_SIZES,
  useJournalEntries,
} from "../hooks/useJournalEntries";
import { formatDate, sourceLabel, SOURCE_TONE } from "../labels";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import { JournalEntriesToolbar } from "./JournalEntriesToolbar";

/**
 * The column headers that order the list, and which way each goes FIRST.
 *
 * Newest and largest first on a date and an amount — what somebody opening a
 * ledger is looking for — and A first on a number, where the top of the
 * alphabet is the top of the list. SUMBER IS NOT SORTABLE because the cell
 * shows a label ("Faktur", "Jurnal manual") while the server could only order
 * by the code behind it, and a header that sorts by something other than what
 * it displays is worse than one that does not invite the click (the rule Kas &
 * Bank's list set on 20 September). Keterangan and Cabang stopped sorting on
 * 20 October 2026 (BO).
 */
const SORT_OPTIONS: SortOptions<JournalEntrySort> = {
  tanggal: { asc: "oldest", desc: "newest", first: "desc" },
  nomor: { asc: "numberAsc", desc: "numberDesc" },
  nilai: { asc: "totalAsc", desc: "totalDesc", first: "desc" },
};

/** Tanggal, No. jurnal, Keterangan, Sumber, Cabang, Nilai, Status. */
const COLUMNS: DataTableColumn<JournalEntry>[] = [
  {
    id: "tanggal",
    header: "Tanggal",
    cellClassName: "text-sm tabular-nums whitespace-nowrap",
    cell: (entry) => formatDate(entry.date),
  },
  {
    id: "nomor",
    header: "No. jurnal",
    cell: (entry) => (
      <Link
        href={`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`}
        onClick={(event) => event.stopPropagation()}
        className="rounded-md text-sm font-semibold tabular-nums text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {entry.entryNumber}
      </Link>
    ),
  },
  {
    id: "keterangan",
    header: "Keterangan",
    cellClassName: "max-w-md",
    cell: (entry) => (
      <>
        <p className="truncate text-sm font-medium">{entry.description}</p>
        {entry.source.reference && (
          <p className="truncate text-xs tabular-nums text-muted">
            {entry.source.reference}
          </p>
        )}
      </>
    ),
  },
  {
    id: "sumber",
    header: "Sumber",
    cell: (entry) => (
      <span
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          SOURCE_TONE[entry.source.type],
        )}
      >
        {sourceLabel(entry.source.type)}
      </span>
    ),
  },
  {
    id: "cabang",
    header: "Cabang",
    cellClassName: "text-sm whitespace-nowrap text-muted",
    cell: (entry) => entry.branchName ?? "—",
  },
  {
    id: "nilai",
    header: "Nilai",
    align: "right",
    cellClassName: "text-sm font-semibold",
    cell: (entry) => formatMoney(entryTotal(entry)),
  },
  {
    id: "status",
    header: "Status",
    cell: (entry) => <StatusBadge entry={entry} />,
  },
];

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
    query.branchIds.length > 0;

  /* "Reset filter (n)" on the scope row — its own two fields; the panel's
     Sumber and the search box keep their own resets. */
  const scopeCount =
    (query.branchIds.length > 0 ? 1 : 0) +
    (query.dateFrom || query.dateTo ? 1 : 0);

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

      {/* The Keuangan scope row (12 October 2026) — no Lini bisnis here: an
          entry is not in a line, its lines are. */}
      <FinanceScopeCard
        branches={branches}
        branchIds={query.branchIds}
        onBranchIdsChange={(branchIds) => setQuery({ branchIds })}
        presets={presets}
        dateFrom={query.dateFrom}
        dateTo={query.dateTo}
        onDateRangeChange={({ from, to }) =>
          setQuery({ dateFrom: from, dateTo: to })
        }
        dateLabel="Tanggal jurnal"
        trailing={
          scopeCount > 0 ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() =>
                setQuery({ branchIds: [], dateFrom: "", dateTo: "" })
              }
            >
              Reset filter ({scopeCount})
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-col gap-4">
          {/* The list's own heading rather than the Card's `title`, in sentence
              case since 20 October 2026 (BO) — as Kas & Bank's "Daftar
              transaksi". */}
          <h2 className="text-lg font-bold">
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

          <DataTable
            columns={COLUMNS}
            rows={entries}
            rowKey={(entry) => entry._id}
            sort={{
              value: query.sort,
              options: SORT_OPTIONS,
              onChange: (sort) => setQuery({ sort }),
            }}
            loading={loading}
            loadingLabel="Memuat jurnal…"
            // The whole row opens the entry, as the mockup's does; the number
            // stays a real link for opening in a new tab.
            onRowClick={(entry) =>
              router.push(`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`)
            }
            empty={
              <div className="px-4 py-16 text-center">
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
              </div>
            }
          />

          {!(loading && entries.length === 0) && (
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
