"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Breadcrumb } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { JournalEntry, JournalSourceType } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { DUMMY_ENTRIES } from "../data/dummy";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import { formatDate, formatMonth, SOURCE_LABEL, SOURCE_TONE } from "../labels";
import { DummyNotice } from "./DummyNotice";

/** Radix Select forbids an empty item value, so "all" is the sentinel. */
const ALL = "all";

/** The filter offers the source types, in the order they appear in the model. */
const SOURCES: JournalSourceType[] = [
  "pos",
  "invoice",
  "receipt",
  "goods_receipt",
  "purchase_payment",
  "opname",
  "return",
  "commission",
  "manual",
];

/**
 * The general ledger — every financial fact in the tenant, newest first.
 *
 * ROWS ARE GROUPED BY MONTH, because that is the unit a ledger is read and
 * closed in. A flat list of 500 entries answers "what happened" but never "what
 * happened in July", and the subtotal on each month header is the number
 * somebody is actually scrolling for.
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
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<JournalSourceType | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const term = search.trim().toLowerCase();

  const rows = useMemo(
    () =>
      DUMMY_ENTRIES.filter((entry) => {
        if (source !== ALL && entry.source.type !== source) return false;
        // Both bounds are inclusive and compare ISO date strings directly —
        // "2026-08-01" <= "2026-08-07" is true lexicographically as well as
        // chronologically, which is the one thing YYYY-MM-DD is for.
        if (dateFrom && entry.date < dateFrom) return false;
        if (dateTo && entry.date > dateTo) return false;
        if (!term) return true;
        return (
          entry.entryNumber.toLowerCase().includes(term) ||
          entry.description.toLowerCase().includes(term) ||
          (entry.source.reference ?? "").toLowerCase().includes(term)
        );
      }),
    [term, source, dateFrom, dateTo],
  );

  const total = sumDecimals(rows.map(entryTotal));
  const manualCount = rows.filter(
    (entry) => entry.source.type === "manual",
  ).length;
  const correctionCount = rows.filter(
    (entry) => entry.reversedByEntryId || entry.reversesEntryId,
  ).length;

  const filtered =
    term !== "" || source !== ALL || dateFrom !== "" || dateTo !== "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Jurnal Umum" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Jurnal Umum
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Buku besar tenant. Semua modul — POS, faktur, pembelian, opname —
          mencatat ke sini, dan laporan laba rugi, neraca serta arus kas dibaca
          dari daftar ini. Entri yang sudah diposting tidak bisa diubah; koreksi
          dilakukan dengan jurnal pembalik.
        </p>
      </div>

      <DummyNotice endpoint="GET /api/journal-entries" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Entri" value={`${rows.length}`} />
        <SummaryTile
          label="Total debit = kredit"
          value={formatMoney(total)}
          mono
        />
        <SummaryTile label="Entri manual" value={`${manualCount}`} />
        <SummaryTile
          label="Terkait pembalikan"
          value={`${correctionCount}`}
          tone={correctionCount > 0 ? "text-danger" : undefined}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nomor jurnal, keterangan, atau dokumen"
                aria-label="Cari entri jurnal"
                className="pl-9"
              />
            </div>

            <Select
              value={source}
              onValueChange={(value) =>
                setSource(value as JournalSourceType | typeof ALL)
              }
            >
              <SelectTrigger aria-label="Filter sumber entri" className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua sumber</SelectItem>
                {SOURCES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {SOURCE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/*
            Disabled rather than hidden: POST /api/journal-entries exists and
            only ever produces a MANUAL entry — every other source posts
            service-to-service. The button belongs here; it just has nothing to
            call yet.
          */}
          <Button disabled title="Belum tersambung ke API">
            <Plus className="size-4" />
            Jurnal manual
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label
            htmlFor="journal-date-from"
            className="text-xs font-normal text-muted"
          >
            Tanggal transaksi
          </Label>
          <Input
            id="journal-date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="Tanggal transaksi dari"
            className="w-40"
          />
          <span className="text-xs text-muted">s/d</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Tanggal transaksi sampai"
            className="w-40"
          />
          {(dateFrom || dateTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Reset tanggal
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
              <th className="px-4 py-2.5 text-left font-medium">No. jurnal</th>
              <th className="px-4 py-2.5 text-left font-medium">Keterangan</th>
              <th className="px-4 py-2.5 text-left font-medium">Sumber</th>
              <th className="px-4 py-2.5 text-left font-medium">Cabang</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Total debit
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Tidak ada entri di filter ini
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {filtered
                      ? "Coba longgarkan filter tanggal atau sumbernya."
                      : "Entri muncul begitu ada transaksi yang diposting."}
                  </p>
                </td>
              </tr>
            )}

            {groupByMonth(rows).map(([month, entries]) => (
              <Fragment key={month}>
                <tr className="border-b border-border bg-accent/60">
                  <td
                    colSpan={5}
                    className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted"
                  >
                    {month}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-xs font-semibold">
                    {formatMoney(sumDecimals(entries.map(entryTotal)))}
                  </td>
                  <td className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-muted">
                    {entries.length} entri
                  </td>
                </tr>

                {entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/keuangan/journal-entries/${entry._id}`}
                        className="tabular-nums text-xs hover:text-primary-hover"
                      >
                        {entry.entryNumber}
                      </Link>
                    </td>
                    <td className="max-w-md px-4 py-2.5">
                      <p className="truncate text-sm font-medium">
                        {entry.description}
                      </p>
                      <p className="truncate tabular-nums text-[11px] text-muted">
                        {entry.source.reference ?? `${entry.lines.length} baris`}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          entry.source.type !== "manual" && "border-transparent",
                          SOURCE_TONE[entry.source.type],
                        )}
                      >
                        {SOURCE_LABEL[entry.source.type]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                      {entry.branchName}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold">
                      {formatMoney(entryTotal(entry))}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge entry={entry} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
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
 */
function StatusBadge({ entry }: { entry: JournalEntry }) {
  if (entry.reversedByEntryId) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-danger/10 text-danger"
        title="Sudah dikoreksi oleh jurnal pembalik. Angkanya tidak lagi berpengaruh ke laporan."
      >
        dibalik
      </Badge>
    );
  }

  if (entry.reversesEntryId) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-secondary/25 text-secondary-foreground"
        title="Entri pembalik — dibuat untuk membatalkan entri lain."
      >
        pembalik
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-transparent bg-success/12 text-success"
    >
      diposting
    </Badge>
  );
}

function SummaryTile({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums text-foreground",
          mono && "tabular-nums",
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Splits the already-sorted rows into [month label, entries] pairs.
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
