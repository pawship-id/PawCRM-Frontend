"use client";

import { Fragment } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { Alert, Breadcrumb, Pagination, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { useJournalEntries } from "../hooks/useJournalEntries";
import { formatDate, formatMonth, SOURCE_LABEL, SOURCE_TONE } from "../labels";
import { JournalEntriesToolbar } from "./JournalEntriesToolbar";

/** Tanggal, No. jurnal, Keterangan, Sumber, Cabang, Total debit, Status. */
const COLUMN_COUNT = 7;

/**
 * The general ledger — every financial fact in the tenant, newest first, read
 * from GET /api/journal-entries through `useJournalEntries`.
 *
 * ROWS ARE GROUPED BY MONTH, because that is the unit a ledger is read and
 * closed in. A flat list of 500 entries answers "what happened" but never "what
 * happened in July", and the subtotal on each month header is the number
 * somebody is actually scrolling for.
 *
 * EVERY SUBTOTAL ON THIS SCREEN IS SCOPED TO THE PAGE, and it says so in three
 * places — the tile label, the month header's caption, and the note under the
 * table. That is the one thing the move off fixtures changed here: the old screen
 * held the whole book in memory, so a month header could add up the month. The
 * API pages at 20, a busy month spans several pages, and a header that summed
 * only the rows in front of it while reading "Agustus 2026" would be a wrong
 * number wearing a right label — the most expensive kind on a finance screen.
 * The period's real totals come from GET /journal-entries/summary, which is what
 * the Keuangan dashboard renders.
 *
 * THE TOTAL COLUMN IS THE DEBIT SIDE, and saying so in the header matters: an
 * entry's "amount" is not a stored field — Σdebit equals Σcredit by definition,
 * so either side is the total and neither is the row's own property. A column
 * that silently picked one would invite the question of which.
 *
 * NO EDIT ACTION ANYWHERE, on purpose. A posted entry is immutable and there is
 * no delete route: a wrong entry is corrected by REVERSING it, which leaves both
 * the error and the correction in the list. That is why the status column exists
 * — "dibalik" and "pembalik" are the two halves of a correction, and hiding them
 * would make the same transaction look like it was recorded twice.
 */
export function JournalEntriesScreen() {
  const {
    entries,
    pagination,
    totals,
    query,
    branches,
    loading,
    error,
    setQuery,
    refetch,
  } = useJournalEntries();

  /**
   * Σdebit === Σcredit is the invariant the backend refuses a posting over, so
   * the two agreeing is not news — but if they ever do not, that is the most
   * important thing on the screen and it must not be silent.
   */
  const unbalanced = totals !== null && totals.debit !== totals.credit;

  const filtered =
    query.search.trim() !== "" ||
    query.sourceType !== "" ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.branchId !== "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Jurnal Umum" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Jurnal Umum
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Buku besar tenant. Semua modul — POS, faktur, pembelian, opname —
          mencatat ke sini, dan laporan laba rugi, neraca serta arus kas dibaca
          dari daftar ini. Entri yang sudah diposting tidak bisa diubah; koreksi
          dilakukan dengan jurnal pembalik.
        </p>
      </div>

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

      <JournalEntriesToolbar
        query={query}
        branches={branches}
        loading={loading}
        onChange={setQuery}
        onRefresh={refetch}
      />

      {/* BOTH FIGURES COVER THE WHOLE FILTER, not the page — the count from the
          list's own `pagination.total`, the amount from
          GET /journal-entries/totals. Neither moves as somebody pages, which is
          what makes them safe to quote. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryTile
          label="Entri"
          value={`${pagination.total}`}
          hint={scopeHint(filtered)}
        />
        <SummaryTile
          label="Total debit"
          // "—" while it is in flight or after it failed. Rendering 0 would be
          // stating a fact about somebody's books that was never checked.
          value={totals === null ? "—" : formatMoney(totals.debit)}
          hint={
            unbalanced
              ? `Tidak seimbang — total kredit ${formatMoney(totals.credit)}`
              : scopeHint(filtered)
          }
          tone={unbalanced ? "danger" : undefined}
        />
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat jurnal…
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <Table className={loading ? "opacity-60" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. jurnal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">Total debit</TableHead>
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
                          : "Belum ada entri di buku besar."}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {filtered
                          ? "Coba longgarkan tanggal atau sumbernya, atau hapus kata kuncinya."
                          : "Entri muncul begitu ada transaksi yang diposting — penjualan, penerimaan barang, atau opname."}
                      </p>
                    </TableCell>
                  </TableRow>
                )}

                {groupByMonth(entries).map(([month, monthEntries]) => (
                  <Fragment key={month}>
                    {/* A month heading is not an entry, so it fills no entry
                        column — the same choice ChartOfAccountsScreen makes for
                        its class headings, including switching off ui/table's
                        own hover so the row never reads as clickable. */}
                    <TableRow className="bg-surface-hover hover:bg-surface-hover">
                      <TableCell
                        colSpan={5}
                        className="px-4 py-1.5 text-xs font-semibold tracking-widest text-muted uppercase"
                      >
                        {month}
                      </TableCell>
                      <TableCell className="px-4 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {formatMoney(sumDecimals(monthEntries.map(entryTotal)))}
                      </TableCell>
                      <TableCell className="px-4 py-1.5 text-xs tabular-nums text-muted">
                        {monthEntries.length} entri di halaman ini
                      </TableCell>
                    </TableRow>

                    {monthEntries.map((entry) => (
                      <TableRow key={entry._id}>
                        <TableCell className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Link
                            href={`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`}
                            className="rounded-md text-sm tabular-nums underline-offset-4 hover:text-primary-hover hover:underline focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {entry.entryNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-md px-4 py-2.5">
                          <p className="truncate text-sm font-medium">
                            {entry.description}
                          </p>
                          <p className="truncate text-xs tabular-nums text-muted">
                            {/* The source document's number when the server could
                                resolve one — `pos`, `invoice`, `receipt` and
                                `commission` have no collection to read it from
                                yet, so those fall back to the line count. */}
                            {entry.source.reference ??
                              `${entry.lines.length} baris`}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                              SOURCE_TONE[entry.source.type],
                            )}
                          >
                            {SOURCE_LABEL[entry.source.type]}
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
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="entri"
            unitPlural="entri"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      <p className="text-xs text-muted">
        Total debit di atas mencakup seluruh filter. Subtotal di setiap baris
        bulan hanya menjumlahkan entri di halaman ini — untuk laba rugi per
        periode, buka{" "}
        <Link
          href={ACCOUNTING_CRUMBS.hub.href}
          className="text-primary-hover underline-offset-4 hover:underline"
        >
          ringkasan Keuangan
        </Link>
        .
      </p>
    </div>
  );
}

/** Σdebit — equal to Σcredit by definition, so either side is "the amount". */
export function entryTotal(entry: JournalEntry): string {
  return sumDecimals(entry.lines.map((line) => line.debit));
}

/**
 * Where an entry sits in the correction story: an ordinary posting, one that has
 * been undone, or the entry that undid one.
 *
 * Pale tint, saturated ink, no border, and always a word (§9) — never the colour
 * alone. "dibalik" on a row whose amounts no longer reach any report is the most
 * important thing on it.
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

/** What a figure is scoped by, said under it rather than left to be assumed. */
function scopeHint(filtered: boolean): string {
  return filtered ? "seluruh filter, bukan halaman ini" : "seluruh buku besar";
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  /** `danger` for a figure that is itself the problem — see `unbalanced`. */
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && (
        // §13: danger text is under the 4.5:1 floor, so where it appears it is
        // ≥14px and semibold, and it always carries a word rather than relying
        // on the colour.
        <p
          className={cn(
            "mt-0.5 text-xs text-muted",
            tone === "danger" && "text-sm font-semibold text-danger",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Splits the page's rows into [month label, entries] pairs.
 *
 * Relies on the list arriving newest-first, exactly as the API returns it, so a
 * month is a contiguous run and no re-sorting is needed here — sorting a second
 * time in the client is how a list starts disagreeing with its own pagination.
 */
function groupByMonth(entries: JournalEntry[]): Array<[string, JournalEntry[]]> {
  const groups: Array<[string, JournalEntry[]]> = [];

  for (const entry of entries) {
    const month = formatMonth(entry.date);
    const current = groups.at(-1);
    if (current && current[0] === month) {
      current[1].push(entry);
    } else {
      groups.push([month, [entry]]);
    }
  }

  return groups;
}
