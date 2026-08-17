"use client";

import { useState } from "react";
import { ListFilter, Plus, RotateCcw } from "lucide-react";

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
import type { JournalSourceType } from "@/types/accounting";
import type { Branch } from "@/types/api";

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

/** Everything the panel edits, as one draft. */
type LedgerFilters = Pick<
  JournalEntriesQuery,
  "sourceType" | "dateFrom" | "dateTo" | "branchId"
>;

/** What Reset returns to. Every field here is genuinely "off" when empty. */
const CLEARED: LedgerFilters = {
  sourceType: "",
  dateFrom: "",
  dateTo: "",
  branchId: "",
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
 * NO SORT FIELD, unlike the chart of accounts. GET /journal-entries orders by
 * transaction date newest-first and names no alternative, and §8 is explicit
 * that a picker only offers orderings the API has.
 *
 * SEARCH STAYS OUTSIDE THE PANEL because it applies live and debounced; burying a
 * field that needs no Terapkan behind one that does would make it feel broken.
 *
 * MUAT ULANG IS ON THE BAR, which `ChartOfAccountsToolbar` deliberately has no
 * equivalent of — and the difference is the point. A chart of accounts changes
 * only when somebody edits it, so a standing reload there would do nothing
 * visible almost every time. The ledger is written by every other module in the
 * product: POS, faktur, penerimaan barang and opname all post into it while this
 * screen is open, so "is there anything new" is a real question here.
 */
export function JournalEntriesToolbar({
  query,
  branches,
  loading,
  onChange,
  onRefresh,
}: {
  query: JournalEntriesQuery;
  branches: Branch[];
  /** True while the ledger is in flight — the reload button says so. */
  loading: boolean;
  onChange: (patch: Partial<JournalEntriesQuery>) => void;
  onRefresh: () => void;
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
      onClearAll={() => onChange(CLEARED)}
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
        <>
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            <RotateCcw className="size-4" />
            {loading ? "Memuat…" : "Muat ulang"}
          </Button>

          {/*
            Disabled rather than hidden. POST /api/journal-entries exists and
            only ever produces a MANUAL entry — every other source posts
            service-to-service — so the button belongs on this screen and
            nowhere else. What is missing is the form: a manual entry is a set
            of lines that has to balance before it can be sent, which is a
            screen of its own rather than a dialog bolted onto a list.
          */}
          <Can feature="journalEntries" action="create">
            <Button disabled title="Form jurnal manual belum tersedia">
              <Plus className="size-4" />
              Jurnal manual
            </Button>
          </Can>
        </>
      }
    >
      <LedgerFilterPanel
        applied={{
          sourceType: query.sourceType,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          branchId: query.branchId,
        }}
        branches={branches}
        onApply={onChange}
      />
    </FilterBar>
  );
}

/**
 * Sumber, tanggal and cabang behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8) — so composing
 * "manual entries in July at Cabang Bogor" is one request rather than three.
 * Reset clears everything and applies at once, because clearing a filter is not
 * a change anyone composes.
 *
 * THE COUNT ON THE TRIGGER IS NOT DECORATION. A panel hides its values, and a
 * hidden filter is one people forget is on and then read the wrong numbers from
 * — which on a ledger means quoting a total for a period they did not mean.
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
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber entri"
          value={draft.sourceType}
          options={SOURCE_OPTIONS}
          onChange={(sourceType) => setDraft((prev) => ({ ...prev, sourceType }))}
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
