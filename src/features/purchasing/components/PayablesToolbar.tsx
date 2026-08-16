"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Plus } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { PurchaseInvoiceSort, Supplier } from "@/types/api";

import { useSupplierOptions } from "../hooks/useSupplierOptions";
import type {
  PayablesView,
  PurchaseInvoicesQuery,
} from "../hooks/usePurchaseInvoices";

/**
 * The view lens.
 *
 * ORDERED BY URGENCY, NOT BY THE ENUM. "Jatuh tempo" first because it is the
 * question somebody opens this screen at 9am to answer, then what is about to
 * become that question, then the planning view, then the exact statuses, then
 * everything. `unpaid`/`partial`/`paid` are the API's statuses; the first three
 * entries are its AP shorthands — all of them go over the wire, none is computed
 * here.
 *
 * "Minggu ini" IS THE PAYMENT RUN, and it is the chip the hub's second panel
 * finally has a list behind: what falls due inside the server's horizon and is
 * not already late. Without it the only way to see that set was the hub's
 * five-row preview, because it is a window no date filter on this screen can
 * express — `Tanggal faktur` bounds when the vendor ISSUED the bill, never when
 * it comes due.
 *
 * Rendered as a pill row rather than the segmented control it used to be: a
 * small-cardinality lens that is the first thing anyone reaches for is what a
 * pill row is for (docs/ui-rules.md §8). `tone` carries the urgency the old
 * `urgent` flag did.
 */
const VIEWS: PillOption<PayablesView>[] = [
  { value: "overdue", label: "Jatuh tempo", tone: "danger" },
  { value: "dueSoon", label: "Minggu ini" },
  { value: "outstanding", label: "Belum lunas" },
  { value: "partial", label: "Sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "all", label: "Semua" },
];

/**
 * The orderings the API accepts — PURCHASE_INVOICE_SORTS in the model.
 *
 * TWO DATE AXES, which is what makes this list longer than the usual pair, and
 * the labels have to say which one is which because the row shows both dates:
 *
 *   Terbaru / Terlama — by `invoiceDate`, the day the SUPPLIER issued the bill.
 *                       The date printed on the document somebody is holding.
 *   Jatuh tempo …     — by `dueDate`, the day we have to pay. The question this
 *                       screen exists for.
 *
 * "Terdekat" / "terjauh" rather than a direction, because on a deadline that is
 * what people say; the model names its keys the same way for the same reason.
 *
 * THIS IS NOT A SECOND COPY OF THE PILL ROW. "Jatuh tempo" up there narrows to
 * the bills already late; "Jatuh tempo terdekat" down here orders whatever is on
 * the page by deadline without removing anything. They compose — the late bills,
 * oldest deadline first — which is why one is a lens and the other an ordering.
 *
 * NOTHING BY WHAT IS OWED, though it is the column people scan. The outstanding
 * amount is not stored on the invoice (it is total + tax − Σ payments, computed
 * per row), so the server cannot order by it — see the model. The per-supplier
 * version of that question is what `/purchase-invoices/outstanding` answers, and
 * it is already on the supplier list.
 */
const SORTS: FilterOption<PurchaseInvoiceSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "dueSoonest", label: "Jatuh tempo terdekat" },
  { value: "dueLatest", label: "Jatuh tempo terjauh" },
];

/** Everything the panel edits, as one draft. */
interface PayablesFilters {
  supplierId: string;
  dateFrom: string;
  dateTo: string;
  sort: PurchaseInvoiceSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 *
 * THE VIEW IS NOT IN HERE, and that is deliberate. Reset clears what the PANEL
 * holds; the lens lives outside it, applies on click, and is the one control on
 * this screen somebody has always set on purpose. A Reset that also threw the
 * screen back to "Belum lunas" would undo a choice the button does not appear
 * to be about.
 */
const CLEARED: PayablesFilters = {
  supplierId: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

/**
 * The payables list controls: the view lens on its own row, then search, one
 * Filter button and the way to file a new supplier bill — with supplier, the
 * issue-date range and the ordering inside the panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePurchaseInvoices. Mirrors ReceiptsToolbar.
 *
 * THE LENS STAYS OUTSIDE THE PANEL. §8 is explicit: a dimension that is the
 * page's main lens, has small cardinality and is the first thing anyone reaches
 * for is a pill row, outside the bar, applying on click. Folding it into the
 * panel would put the one control this screen is opened to use behind a button
 * and a Terapkan.
 *
 * WHAT WENT IN IS EVERYTHING ELSE, at every width — the arrangement Produk &
 * Varian and Penerimaan Barang both use. The date range decides it on its own:
 * a control carrying its own Reset/Terapkan belongs in a panel whatever else is
 * on the bar. On a phone the pills already take two rows, and a bar of triggers
 * under them pushed the table off the fold entirely.
 *
 * THE DATE RANGE BOUNDS `invoiceDate` — the day the SUPPLIER issued the bill,
 * not when it was keyed in and not when it falls due. That is the date printed
 * on the document somebody is holding while they search, and it is what an AP
 * ageing report groups by. Lateness is the lens's job and the deadline
 * orderings' job, so the three never share a control.
 *
 * NO "TAMPILKAN TERHAPUS" TOGGLE: no route deletes an invoice, so no invoice is
 * ever in a state to reveal.
 */
export function PayablesToolbar({
  query,
  onChange,
}: {
  query: PurchaseInvoicesQuery;
  onChange: (patch: Partial<PurchaseInvoicesQuery>) => void;
}) {
  const { suppliers } = useSupplierOptions();

  const applied: PayablesFilters = {
    supplierId: query.supplierId,
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
  function apply(next: PayablesFilters) {
    const patch: Partial<PurchaseInvoicesQuery> = {};
    if (next.supplierId !== query.supplierId) patch.supplierId = next.supplierId;
    if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The lens sits outside the bar: it is one click, always applied, and
          never something you compose with the filters below it. It wraps onto a
          second row on a phone rather than scrolling sideways — six short pills
          are readable stacked, and a horizontally scrolling row hides the
          rightmost option, which here is "Semua". */}
      <FilterPills
        ariaLabel="Tampilan faktur"
        value={query.view}
        options={VIEWS}
        onChange={(view) => onChange({ view })}
      />

      <FilterBar
        // Search leads the row and takes what is left of it: with the triggers
        // collapsed there is nothing else on the line that grows, and what
        // people type here is an invoice number off a vendor's paperwork.
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        // Below sm the row cannot hold all three, so the create button takes a
        // line of its own — and takes all of it. A button hugging its label at
        // one end of an otherwise empty row reads as something left behind.
        actionsClassName="max-sm:w-full"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => onChange({ search })}
            // Names exactly the two fields the API searches — a placeholder
            // promising a field the server does not match is a bug report
            // waiting to be filed.
            placeholder="Cari nomor faktur atau catatan…"
            ariaLabel="Cari faktur"
            fill
          />
        }
        actions={
          <Can feature="purchaseInvoices" action="create">
            <Button asChild className="w-full">
              <Link href="/dashboard/purchasing/payables/new">
                <Plus className="size-4" />
                Catat faktur supplier
              </Link>
            </Button>
          </Can>
        }
      >
        <PayablesFilterPanel
          applied={applied}
          suppliers={suppliers}
          onApply={apply}
        />
      </FilterBar>
    </div>
  );
}

/**
 * Supplier, the issue-date range and the ordering, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function PayablesFilterPanel({
  applied,
  suppliers,
  onApply,
}: {
  applied: PayablesFilters;
  suppliers: Supplier[];
  onApply: (next: PayablesFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE RANGE COUNTS ONCE, not twice — one bound or both, it is one question
   * somebody asked. THE ORDERING IS NOT COUNTED AT ALL: every list has one, so
   * it is never "on".
   *
   * NEITHER IS THE VIEW, and that one is worth saying out loud because it is
   * genuinely narrowing the list. It is not counted because it is not hidden:
   * the badge exists to pay back what a panel conceals, and the lens is a row of
   * pills with the current one filled in, sitting right above the button. A
   * number covering a control the user can already see would double-count the
   * only filter on this screen that never needs announcing.
   */
  const count = [
    applied.supplierId !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<PayablesFilters>) {
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
        {/* Sort leads: it is the one field here that is always set, and the
            only one that changes what the top of the list is rather than what
            is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Supplier"
          ariaLabel="Filter supplier"
          value={draft.supplierId}
          options={withAll(namedOptions(suppliers), "Semua supplier")}
          onChange={(supplierId) => patch({ supplierId })}
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
