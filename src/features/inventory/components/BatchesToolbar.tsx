"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  formatRangeShort,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import type { BatchSort, StockWarehouse } from "@/types/inventory";

import type { BatchesQuery, Horizon } from "../hooks/useBatches";

/**
 * The batch list controls: one row — search and one Filter button — with the
 * warehouse, the expiry horizon, the ordering and, in audit mode, the "show
 * spent lots" toggle inside a panel.
 *
 * Purely presentational — it renders the current query and reports changes up.
 *
 * THE SAME SHAPE AS THE CATALOGUE'S. There is no create button here — lots are
 * written by receiving goods, never typed in — so the row is search and Filter
 * and nothing else, which lets search take almost the whole width.
 *
 * TWO CONTROLS EXPLAIN THEMSELVES WHEN THEY GO QUIET, which is why they are
 * composed here rather than declared as data:
 *
 *   the horizon   — suspended while a search is active, because the alert
 *                   endpoint cannot filter by code, name or SKU, and tracing one
 *                   lot is a question about its whole life, not about the next
 *                   30 days. Its own custom range goes quiet with it, rather
 *                   than sitting there editable and ignored;
 *   "lot habis"   — absent outside audit mode, because an exhausted lot cannot
 *                   expire into anything and the alert endpoint has no opinion
 *                   to offer about it.
 *
 * A disabled control with no explanation is worse than a missing one; a control
 * that silently does nothing is worse than both. NOW THAT BOTH LIVE IN A PANEL,
 * the explanation has to be said twice over — once on the bar, where somebody
 * who never opens the panel can still see why their horizon stopped mattering,
 * and once beside the greyed field itself. They are not the same sentence: the
 * bar's explains the page, the field's explains the control.
 */
const HORIZONS: FilterOption<Horizon>[] = [
  { value: "7", label: "Kritis — 7 hari" },
  { value: "30", label: "Perhatian — 30 hari" },
  { value: "90", label: "3 bulan" },
  { value: "all", label: "Semua batch" },
  // The presets above all count forward from today, which is the wrong shape
  // for half the questions a stock take asks: "apa yang kedaluwarsa November"
  // and "apa yang lewat tanggal kuartal lalu" both name a window that today is
  // not an end of. This opens two dates underneath.
  { value: "custom", label: "Rentang khusus" },
];

/**
 * The orderings the API accepts — BATCH_SORTS in productBatch.model.js.
 *
 * NO "SISA QTY" HERE. `qtyRemaining` is a decimal string the API does not index
 * and the screen re-reads per warehouse; ordering by it would be a control that
 * quietly sorts something other than what the column shows.
 */
const SORTS: FilterOption<BatchSort>[] = [
  { value: "expirySoonest", label: "Paling cepat kedaluwarsa" },
  { value: "expiryLatest", label: "Paling lama kedaluwarsa" },
  { value: "newest", label: "Terbaru diterima" },
  { value: "oldest", label: "Terlama diterima" },
];

/** Everything the panel edits, as one draft. */
interface BatchFilters {
  warehouseId: string;
  horizon: Horizon;
  includeSpent: boolean;
  sort: BatchSort;
  /** ISO `yyyy-mm-dd`, or "" — only read while `horizon` is "custom". */
  expiryFrom: string;
  expiryTo: string;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The horizon goes back to 30 days rather than to "Semua lot": this screen is
 * an expiry report, and its unfiltered state is the report, not the archive.
 * The ordering goes back to soonest-first for the same reason.
 */
const CLEARED: BatchFilters = {
  warehouseId: "",
  horizon: "30",
  includeSpent: false,
  sort: "expirySoonest",
  // Reset empties the window as well as leaving the custom horizon. Switching
  // AWAY from "Rentang khusus" keeps the dates — see BatchesQuery — but Reset
  // means "back to the report", and a window that survived it would come back
  // the moment somebody picked the custom horizon again.
  expiryFrom: "",
  expiryTo: "",
};

/**
 * The four windows worth one click, all of them looking FORWARD.
 *
 * `FilterDateRange`'s own presets ("7 hari", "30 hari", "bulan ini") all END
 * today, because every other screen that uses it reads a ledger — a record of
 * what already happened. Expiry is the opposite question: a window ending today
 * can only contain stock that has already gone off, so shipping those presets
 * here would put four chips on screen that each return the same handful of rows.
 *
 * "Sudah lewat" is kept, and deliberately first: stock that expired and is still
 * on a shelf is the most urgent thing this screen can report. It has no lower
 * bound — a lot that expired two years ago is still a lot somebody has to pull.
 */
function expiryPresets() {
  const today = new Date();
  const iso = (date: Date) => {
    // Local parts, never toISOString(): that is UTC and shifts the day for
    // everyone east of Greenwich, which is everyone using this.
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };
  const ahead = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
  };
  // Day 0 of the following month is the last day of this one, whatever its
  // length and whether or not February is leap.
  const monthStart = (offset: number) =>
    iso(new Date(today.getFullYear(), today.getMonth() + offset, 1));
  const monthEnd = (offset: number) =>
    iso(new Date(today.getFullYear(), today.getMonth() + offset + 1, 0));

  return [
    { label: "Sudah lewat", from: "", to: iso(today) },
    { label: "60 hari ke depan", from: iso(today), to: ahead(60) },
    // WHOLE calendar months, not "from today": the label says a month, and a
    // window that quietly began this morning would drop the lots that expired
    // earlier in it — which on this screen are the urgent ones.
    { label: "Bulan ini", from: monthStart(0), to: monthEnd(0) },
    { label: "Bulan depan", from: monthStart(1), to: monthEnd(1) },
  ];
}

/**
 * The sentence under the bar — what the list is actually showing right now,
 * whenever that is not what the controls appear to say.
 *
 * THREE STATES, and each of them is a question somebody would otherwise ask the
 * screen twice. A search suspends the horizon; a custom range with nothing in it
 * narrows nothing at all; a custom range that IS filled silently drops the lots
 * with no expiry date, which on a screen that otherwise lists them is the kind
 * of omission people discover by counting.
 */
function hint(query: BatchesQuery, searching: boolean) {
  if (searching) {
    return (
      <>
        Pencarian kode batch, nama produk, dan SKU berlaku di{" "}
        <b>seluruh batch</b> — termasuk yang sudah habis dan yang tidak punya
        tanggal kedaluwarsa — jadi rentang kedaluwarsa dinonaktifkan selama
        kotak pencarian terisi.
      </>
    );
  }

  if (query.horizon !== "custom") return null;

  const range = formatRangeShort(query.expiryFrom, query.expiryTo);

  if (!range) {
    return (
      <>
        Rentang khusus belum diisi, jadi daftar ini menampilkan{" "}
        <b>seluruh batch</b>. Isi tanggalnya lewat Filter.
      </>
    );
  }

  return (
    <>
      Menampilkan batch yang kedaluwarsa <b>{range}</b> — batch tanpa tanggal
      kedaluwarsa tidak ikut, karena tidak bisa jatuh di dalam rentang tanggal.
    </>
  );
}

export function BatchesToolbar({
  query,
  warehouses,
  auditMode,
  onChange,
}: {
  query: BatchesQuery;
  warehouses: StockWarehouse[];
  /** True when the whole-collection endpoint is answering. */
  auditMode: boolean;
  onChange: (patch: Partial<BatchesQuery>) => void;
}) {
  const searching = query.search.trim() !== "";

  const applied: BatchFilters = {
    warehouseId: query.warehouseId,
    horizon: query.horizon,
    includeSpent: query.includeSpent,
    sort: query.sort,
    expiryFrom: query.expiryFrom,
    expiryTo: query.expiryTo,
  };

  /**
   * Commits the draft, sending only what actually moved — the fetch effect keys
   * on the query object's identity, so posting every field back would re-query
   * the list after a Terapkan that changed nothing.
   */
  function apply(next: BatchFilters) {
    const patch: Partial<BatchesQuery> = {};
    if (next.warehouseId !== query.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.horizon !== query.horizon) patch.horizon = next.horizon;
    if (next.includeSpent !== query.includeSpent)
      patch.includeSpent = next.includeSpent;
    if (next.sort !== query.sort) patch.sort = next.sort;
    if (next.expiryFrom !== query.expiryFrom)
      patch.expiryFrom = next.expiryFrom;
    if (next.expiryTo !== query.expiryTo) patch.expiryTo = next.expiryTo;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it. With no create
      // button here, "what is left" is nearly all of it — which suits a box
      // people paste a batch code into.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari kode batch, nama produk, atau SKU…"
          ariaLabel="Cari kode batch, nama produk, atau SKU"
          fill
        />
      }
      hint={hint(query, searching)}
    >
      <BatchFilterPanel
        applied={applied}
        warehouses={warehouses}
        auditMode={auditMode}
        searching={searching}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The warehouse, the horizon, the ordering and the spent-lot toggle, behind one
 * button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once.
 */
function BatchFilterPanel({
  applied,
  warehouses,
  auditMode,
  searching,
  onApply,
}: {
  applied: BatchFilters;
  warehouses: StockWarehouse[];
  auditMode: boolean;
  searching: boolean;
  onApply: (next: BatchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * NEITHER THE ORDERING NOR THE HORIZON IS COUNTED. Every list has an
   * ordering, and this screen always has a horizon — 30 days is its resting
   * state, not a filter somebody applied. Counting either would put a standing
   * number over an unnarrowed report and teach people to ignore it, which is
   * the one thing the badge cannot afford now that the controls are hidden.
   */
  const count = [
    applied.warehouseId !== "",
    applied.horizon !== CLEARED.horizon,
    applied.includeSpent,
  ].filter(Boolean).length;

  function patch(change: Partial<BatchFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
    setOpen(next);
  }

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
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="expirySoonest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Gudang"
          value={draft.warehouseId}
          options={withAll(
            namedOptions(warehouses, (w) =>
              w.isActive ? w.name : `${w.name} (nonaktif)`,
            ),
            "Semua gudang",
          )}
          onChange={(warehouseId) => patch({ warehouseId })}
        />
        <FilterSelect
          layout="field"
          label="Kedaluwarsa"
          ariaLabel="Rentang kedaluwarsa"
          value={draft.horizon}
          unsetValue="all"
          options={HORIZONS}
          disabled={searching}
          disabledHint="Nonaktif selama kotak pencarian terisi — pencarian berlaku di seluruh batch."
          onChange={(horizon) => patch({ horizon })}
        />

        {/* Only under its own horizon, and only while the horizon still means
            something. Rendered greyed during a search it would be a pair of
            date inputs that accept typing and change nothing; the select above
            already says why the whole horizon is quiet. */}
        {draft.horizon === "custom" && !searching && (
          <FilterDateRange
            layout="field"
            // Named for the DATES rather than repeating the select above it —
            // two blocks both reading "Rentang kedaluwarsa" is one label doing
            // two jobs, and a screen reader announcing it twice.
            label="Tanggal kedaluwarsa"
            ariaLabel="Tanggal kedaluwarsa"
            from={draft.expiryFrom}
            to={draft.expiryTo}
            // Expiry looks FORWARD, so the presets that ship with the control —
            // "7 hari", "bulan ini", all of them ending today — would offer a
            // window in which nothing but already-expired stock can fall.
            presets={expiryPresets()}
            onApply={({ from, to }) =>
              patch({ expiryFrom: from, expiryTo: to })
            }
          />
        )}

        {auditMode && (
          <FilterToggle
            label="Tampilkan batch yang sudah habis"
            checked={draft.includeSpent}
            onChange={(includeSpent) => patch({ includeSpent })}
          />
        )}
      </FilterPanel>
    </>
  );
}
