"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Plus } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  formatRangeShort,
  namedOptions,
  withAll,
  type AppliedFilter,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { JournalEntrySort, JournalSourceType } from "@/types/accounting";
import type { Branch } from "@/types/api";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import type { JournalEntriesQuery } from "../hooks/useJournalEntries";
import { SOURCE_LABEL } from "../labels";

/** The source types the API accepts, in the order the model declares them. */
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

const SOURCE_OPTIONS: FilterOption<JournalSourceType | "">[] = withAll(
  SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] })),
  "Semua sumber",
);

/**
 * The orderings the API accepts — JOURNAL_ENTRY_SORTS in journalEntry.model.js.
 *
 * TWO AXES, NOT ONE SPELLED TWICE. Terbaru/Terlama key on the TRANSACTION date,
 * the date in the first column and the one somebody means by "entri terakhir".
 * The number orderings walk the sequence entries were WRITTEN in, and on a ledger
 * those two genuinely differ: an entry keyed in today for a payment taken last
 * month sorts under last month by date and after everything else by number.
 * Walking by number is how you check a series against itself — it is where a gap
 * in the numbering becomes visible, which reading by date never shows.
 *
 * MONTH HEADERS SURVIVE ALL FOUR, which is what makes the number orderings safe
 * on this screen: an entry number is drawn against the entry's own date
 * ("JE-2026-07-0001" for a July transaction, whenever it was typed), so a month
 * stays a contiguous run either way. See groupByMonth in JournalEntriesScreen.
 *
 * NOTHING BY AMOUNT. An entry's total is Σdebit over its lines, not a stored
 * field, so there is no index to order it by — the server would have to sum the
 * whole book to sort it, which on the collection that grows forever is the one
 * ordering that could take this screen down.
 */
const SORTS: FilterOption<JournalEntrySort>[] = [
  { value: "newest", label: "Tanggal terbaru" },
  { value: "oldest", label: "Tanggal terlama" },
  { value: "numberDesc", label: "Nomor jurnal Z–A" },
  { value: "numberAsc", label: "Nomor jurnal A–Z" },
];

/** Everything the panel edits, as one draft. */
type LedgerFilters = Pick<
  JournalEntriesQuery,
  "sourceType" | "dateFrom" | "dateTo" | "branchId" | "sort"
>;

/** The three narrowing fields, off. Every one of them is genuinely "off" empty. */
const NO_FILTERS: Omit<LedgerFilters, "sort"> = {
  sourceType: "",
  dateFrom: "",
  dateTo: "",
  branchId: "",
};

/**
 * What the panel's Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included and it is the one field here that is not cleared but
 * RESTORED: a list with no ordering is not a thing, so Reset puts it back to the
 * API's default. That is the panel's Reset only. "Hapus semua" on the chip row
 * passes `NO_FILTERS` instead, because the sort has no chip — a button that
 * removes the things you can see should not also undo one you cannot.
 */
const CLEARED: LedgerFilters = {
  ...NO_FILTERS,
  sort: "newest",
};

/**
 * The ledger's controls: search on the row, the three filters behind one button.
 *
 * A PANEL AND NOT A QUICK BAR (§8), and the period is what decides it: a date
 * range carries its own Reset and Terapkan, and a control that holds a draft of
 * its own belongs in a panel whatever else is on the bar — the same reasoning
 * that put Penerimaan Barang and Retur ke Supplier there. It is also the
 * arrangement `ChartOfAccountsToolbar` uses, and the two screens are read one
 * after the other by the same person.
 *
 * URUTKAN IS A FIELD IN THE PANEL, not a control of its own (§8), and it leads
 * the stack: it is the one field here that is always set, and the only one that
 * changes what the top of the list is rather than what is in it. It is not in the
 * trigger's `Filter (n)` count for the same reason — every list has an ordering,
 * so counting it would put a standing number over an unnarrowed list and teach
 * people to ignore the badge.
 *
 * SEARCH STAYS OUTSIDE THE PANEL because it applies live and debounced; burying a
 * field that needs no Terapkan behind one that does would make it feel broken.
 */
export function JournalEntriesToolbar({
  query,
  branches,
  onChange,
}: {
  query: JournalEntriesQuery;
  branches: Branch[];
  onChange: (patch: Partial<JournalEntriesQuery>) => void;
}) {
  const chips: AppliedFilter[] = [];

  if (query.sourceType) {
    chips.push({
      key: `source:${query.sourceType}`,
      label: `Sumber ${SOURCE_LABEL[query.sourceType]}`,
      onRemove: () => onChange({ sourceType: "" }),
    });
  }

  if (query.dateFrom || query.dateTo) {
    chips.push({
      key: "period",
      // One chip for the range, not one per bound: an open-ended range is still
      // one question somebody asked, and formatRangeShort already says which end
      // is missing ("sejak 1 Ags").
      label: `Tanggal ${formatRangeShort(query.dateFrom, query.dateTo)}`,
      onRemove: () => onChange({ dateFrom: "", dateTo: "" }),
    });
  }

  if (query.branchId) {
    const branch = branches.find((item) => item._id === query.branchId);
    chips.push({
      key: `branch:${query.branchId}`,
      label: branch?.name ?? "Cabang terpilih",
      onRemove: () => onChange({ branchId: "" }),
    });
  }

  return (
    <FilterBar
      // Search leads and takes what is left of the row: with the filters
      // collapsed behind one button there is nothing else on the line that
      // grows, and what people type here — a whole entry description — is long.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      actionsClassName="max-sm:w-full"
      chips={chips}
      onClearAll={() => onChange(NO_FILTERS)}
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names the fields the server actually matches. `source.reference` is
          // NOT one of them — the old local filter searched it, the API does not,
          // so promising it here would be a placeholder that lies.
          placeholder="Cari nomor jurnal atau keterangan…"
          ariaLabel="Cari entri jurnal"
          fill
        />
      }
      actions={
        /*
          THE ONE WRITABLE ACTION ON THIS SCREEN, and it belongs here and
          nowhere else: POST /api/journal-entries only ever produces a MANUAL
          entry — every other source posts service-to-service — so no other
          list can offer a "new" button that means anything.

          It was disabled until the form existed, because a manual entry is a
          set of lines that has to balance before it can be sent, which is a
          screen of its own rather than a dialog bolted onto a list. That
          screen is /journal-entries/new now.

          LABELLED "Jurnal baru", NOT "Jurnal manual". `manual` is what the
          ledger calls the SOURCE, to tell a typed entry from one a sale
          posted; on a button it reads as a second, lesser kind of journal
          somebody must choose between. From this screen there is only one
          kind a person can make, so the button says what it does.
        */
        <Can feature="journalEntries" action="create">
          <Button asChild>
            <Link href={`${ACCOUNTING_CRUMBS.journal.href}/new`}>
              <Plus className="size-4" />
              Jurnal baru
            </Link>
          </Button>
        </Can>
      }
    >
      <LedgerFilterPanel
        applied={{
          sourceType: query.sourceType,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          branchId: query.branchId,
          sort: query.sort,
        }}
        branches={branches}
        onApply={onChange}
      />
    </FilterBar>
  );
}

/**
 * Urutan, sumber, tanggal and cabang behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8) — so composing
 * "manual entries in July at Cabang Bogor" is one request rather than three.
 * Reset clears everything and applies at once, because clearing a filter is not
 * a change anyone composes.
 *
 * THE COUNT ON THE TRIGGER IS NOT DECORATION. A panel hides its values, and a
 * hidden filter is one people forget is on and then read the wrong numbers from
 * — which on a ledger means quoting a total for a period they did not mean. The
 * sort is excluded from it: it is never unset, so counting it would mean the
 * badge never reads "Filter" and stopped telling anyone anything.
 */
function LedgerFilterPanel({
  applied,
  branches,
  onApply,
}: {
  applied: LedgerFilters;
  branches: Branch[];
  onApply: (next: LedgerFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = [
    applied.sourceType !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
    applied.branchId !== "",
  ].filter(Boolean).length;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
    if (next) setDraft(applied);
    setOpen(next);
  }

  // May be empty when the user cannot read branches — see the hook. A select
  // holding only "Semua cabang" is honest: they are not filtering, because they
  // cannot.
  const branchOptions = withAll(namedOptions(branches), "Semua cabang");

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        {/* Sort leads the stack: it is the one field here that is always set,
            and the only one that changes what the top of the list is rather
            than what is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => setDraft((prev) => ({ ...prev, sort }))}
        />
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber entri"
          value={draft.sourceType}
          options={SOURCE_OPTIONS}
          onChange={(sourceType) =>
            setDraft((prev) => ({ ...prev, sourceType }))
          }
        />
        <FilterDateRange
          layout="field"
          label="Tanggal transaksi"
          ariaLabel="Tanggal transaksi"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) =>
            setDraft((prev) => ({ ...prev, dateFrom: from, dateTo: to }))
          }
        />
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={branchOptions}
          onChange={(branchId) => setDraft((prev) => ({ ...prev, branchId }))}
        />
      </FilterPanel>
    </>
  );
}
