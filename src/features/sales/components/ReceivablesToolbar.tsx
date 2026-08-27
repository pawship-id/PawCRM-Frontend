"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterPills,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  namedOptions,
  withAll,
  type FilterOption,
  type PillOption,
} from "@/components";
import type { Branch, Customer, CustomerInvoiceSource } from "@/types/api";

import { useReceivableFilterOptions } from "../hooks/useReceivableFilterOptions";
import type {
  CustomerInvoiceSort,
  CustomerInvoicesQuery,
  ReceivablesView,
} from "../hooks/useCustomerInvoices";

/**
 * The view lens.
 *
 * ORDERED BY URGENCY, NOT BY THE ENUM. "Jatuh tempo" first because it is the
 * question somebody opens this screen at 9am to answer, then what is about to
 * become that question, then the planning view, then the exact statuses, then
 * everything. The first three entries are the API's AR shorthands; the rest are
 * its statuses — all of them go over the wire, none is computed here.
 *
 * `void` IS ON THE LIST BUT LAST, just before "Semua". It is the one status
 * nobody triages by and the one people occasionally have to go looking for
 * ("which invoices did we cancel last month"). Leaving it out would make those
 * rows reachable only through "Semua", where they sit among everything else.
 *
 * Rendered as a pill row rather than a segmented control: a small-cardinality
 * lens that is the first thing anyone reaches for is what a pill row is for
 * (docs/ui-rules.md §8). `tone` carries the urgency.
 */
const VIEWS: PillOption<ReceivablesView>[] = [
  { value: "overdue", label: "Jatuh tempo", tone: "danger" },
  { value: "dueSoon", label: "Minggu ini" },
  { value: "outstanding", label: "Belum lunas" },
  { value: "partial", label: "DP sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "void", label: "Void" },
  { value: "all", label: "Semua" },
];

/**
 * The orderings the API accepts.
 *
 * TWO DATE AXES, which is what makes this list longer than the usual pair, and
 * the labels have to say which is which because the row shows both dates:
 *
 *   Terbaru / Terlama — by `invoiceDate`, the day the debt was raised.
 *   Jatuh tempo …     — by `dueDate`, the day it falls due. The question this
 *                       screen exists for, and therefore the default.
 *
 * THIS IS NOT A SECOND COPY OF THE PILL ROW. "Jatuh tempo" up there narrows to
 * the invoices already late; "Jatuh tempo terdekat" down here orders whatever is
 * on the page by deadline without removing anything. They compose — the late
 * debts, oldest deadline first — which is why one is a lens and the other an
 * ordering.
 *
 * BY TAGIHAN, NEVER BY SISA — and the labels have to be exact about it. `total`
 * is stored, so "Tagihan terbesar" is a real ordering the database can serve;
 * the outstanding amount is `total - paidAmount`, derived per row, and no index
 * reaches it. Labelling these "Sisa terbesar" would be a control that quietly
 * sorted by a different number than the one it named. The per-customer version
 * of the sisa question is what `/customer-invoices/outstanding` answers, and it
 * feeds the cards above this table.
 */
const SORTS: FilterOption<CustomerInvoiceSort>[] = [
  { value: "dueSoonest", label: "Jatuh tempo terdekat" },
  { value: "dueLatest", label: "Jatuh tempo terjauh" },
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "totalHighest", label: "Tagihan terbesar" },
  { value: "totalLowest", label: "Tagihan terkecil" },
];

/**
 * WHERE THE INVOICE CAME FROM — a filter, never an input.
 *
 * Worth a control of its own because the two sets are read for different
 * reasons: "dari kasir" is every credit sale the till took, which is what an
 * owner checks when the piutang figure moves unexpectedly.
 */
const SOURCES: FilterOption<CustomerInvoiceSource | "">[] = [
  { value: "", label: "Semua sumber" },
  { value: "pos_bridge", label: "Dari kasir" },
  { value: "manual", label: "Manual" },
];

/** Everything the panel edits, as one draft. */
interface ReceivablesFilters {
  customerId: string;
  branchId: string;
  source: CustomerInvoiceSource | "";
  dateFrom: string;
  dateTo: string;
  sort: CustomerInvoiceSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 *
 * THE VIEW IS NOT IN HERE, deliberately. Reset clears what the PANEL holds; the
 * lens lives outside it, applies on click, and is the one control here somebody
 * has always set on purpose. A Reset that also threw the screen back to "Belum
 * lunas" would undo a choice the button does not appear to be about.
 */
const CLEARED: ReceivablesFilters = {
  customerId: "",
  branchId: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  sort: "dueSoonest",
};

/**
 * The receivables list controls: the view lens on its own row, then search and
 * one Filter button — with customer, cabang, sumber, the invoice-date range and
 * the ordering inside the panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useCustomerInvoices. Mirrors PayablesToolbar.
 *
 * THERE IS NO CREATE BUTTON, and its absence is the backend's design rather than
 * an omission here: there is no `POST /api/customer-invoices` yet. Every
 * receivable today is raised by the till when a cashier settles with Piutang.
 * Rendering a button onto a route that does not exist would be worse than the
 * gap it papers over.
 *
 * THE DATE RANGE BOUNDS `invoiceDate` — the day the debt was raised, not when it
 * falls due and not when the row was written. Lateness is the lens's job and the
 * deadline orderings' job, so the three never share a control.
 *
 * NO "TAMPILKAN TERHAPUS" TOGGLE: no route deletes a receivable, so none is ever
 * in a state to reveal. A cancelled one is `void`, which is a pill.
 */
export function ReceivablesToolbar({
  query,
  onChange,
}: {
  query: CustomerInvoicesQuery;
  onChange: (patch: Partial<CustomerInvoicesQuery>) => void;
}) {
  const { customers, branches } = useReceivableFilterOptions();

  const applied: ReceivablesFilters = {
    customerId: query.customerId,
    branchId: query.branchId,
    source: query.source,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    sort: query.sort,
  };

  /**
   * Commits the draft — only what actually moved. `setQuery` builds a new object
   * out of whatever it is passed and the fetch effect keys on it, so posting
   * every field back would re-query the list after a Terapkan that changed
   * nothing.
   */
  function apply(next: ReceivablesFilters) {
    const patch: Partial<CustomerInvoicesQuery> = {};
    if (next.customerId !== query.customerId) patch.customerId = next.customerId;
    if (next.branchId !== query.branchId) patch.branchId = next.branchId;
    if (next.source !== query.source) patch.source = next.source;
    if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The lens sits outside the bar: one click, always applied, never
          something you compose with the filters below it. It wraps onto a second
          row on a phone rather than scrolling sideways — seven short pills are
          readable stacked, and a horizontally scrolling row hides the rightmost
          option, which here is "Semua". */}
      <FilterPills
        ariaLabel="Tampilan piutang"
        value={query.view}
        options={VIEWS}
        onChange={(view) => onChange({ view })}
      />

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => onChange({ search })}
            /*
              NAMES EXACTLY THE TWO FIELDS THE API SEARCHES. The customer's name
              is NOT one of them — it lives in another collection, and matching it
              would mean a join on every keystroke. Promising it here would be a
              bug report waiting to be filed, so the placeholder says what it does
              and the panel below carries a Pelanggan picker for the other half.
            */
            placeholder="Cari nomor faktur atau catatan…"
            ariaLabel="Cari faktur"
            fill
          />
        }
      >
        <ReceivablesFilterPanel
          applied={applied}
          customers={customers}
          branches={branches}
          onApply={apply}
        />
      </FilterBar>
    </div>
  );
}

/**
 * Pelanggan, cabang, sumber, the invoice-date range and the ordering, behind one
 * button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is not
 * a change anyone composes.
 */
function ReceivablesFilterPanel({
  applied,
  customers,
  branches,
  onApply,
}: {
  applied: ReceivablesFilters;
  customers: Customer[];
  branches: Branch[];
  onApply: (next: ReceivablesFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE RANGE COUNTS ONCE, not twice — one bound or both, it is one question
   * somebody asked. THE ORDERING IS NOT COUNTED AT ALL: every list has one, so
   * it is never "on". Neither is the view, because it is not hidden — the badge
   * exists to pay back what a panel conceals, and the lens is a row of pills
   * sitting right above the button.
   */
  const count = [
    applied.customerId !== "",
    applied.branchId !== "",
    applied.source !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<ReceivablesFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
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
        {/* Sort leads: the one field here that is always set, and the only one
            that changes what the top of the list is rather than what is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="dueSoonest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Pelanggan"
          ariaLabel="Filter pelanggan"
          value={draft.customerId}
          options={withAll(namedOptions(customers), "Semua pelanggan")}
          onChange={(customerId) => patch({ customerId })}
        />
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(branches), "Semua cabang")}
          onChange={(branchId) => patch({ branchId })}
        />
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber faktur"
          value={draft.source}
          options={SOURCES}
          onChange={(source) => patch({ source })}
        />
        <FilterDateRange
          layout="field"
          label="Tanggal faktur"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
        />
      </FilterPanel>
    </>
  );
}
