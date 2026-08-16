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
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type {
  PurchaseReturnSort,
  PurchaseReturnStatus,
  Supplier,
} from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { PurchaseReturnsQuery } from "../hooks/usePurchaseReturns";

/**
 * The purchase-return list controls: one row — search, one Filter button, one
 * create button — with the ordering, supplier, warehouse, status and the date
 * range inside the panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePurchaseReturns. Mirrors ReceiptsToolbar, which this screen is the mirror
 * of in the domain too.
 *
 * ONE BUTTON RATHER THAN A ROW OF TRIGGERS, at every width. §8 sends this screen
 * to a panel on the field count alone — five, once the ordering is one of them —
 * and the date range decides it a second time: a control that carries its own
 * Reset/Terapkan puts a screen in the panel column whatever else is on the bar.
 * On a phone the old row of four triggers wrapped onto three lines and pushed
 * the table off the fold.
 *
 * REUSES useReceiptFilterOptions rather than declaring its own. The two screens
 * filter by the same two things for the same reason, and that hook is already
 * deliberately UNFILTERED — a vendor deactivated last month still received
 * everything they received, and a filter that cannot name them cannot find their
 * returns either.
 *
 * THE SEARCH BOX PROMISES ONLY THE RETURN NUMBER, because that is the only field
 * the API matches. There is no `notes` on a return to search — a return explains
 * itself per line, in `items[].reason`, which the list does not carry. Naming a
 * field the server does not match is a bug report waiting to be filed.
 *
 * THE DATE RANGE BOUNDS `returnDate`, the day the goods physically went back —
 * never the day the row was keyed in. A collection the courier made on the 31st
 * and entered on the 2nd belongs to the 31st on every report, and that is the
 * date somebody reconciling a supplier's credit note is searching by. It renders
 * as a FIELD here rather than as its own popover: a popover carrying its own
 * Terapkan inside a panel carrying its own Terapkan is two pairs of verbs for
 * one decision, and the inner one commits nothing a user can see.
 */
const STATUSES = withAll<PurchaseReturnStatus | "">(
  [
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Final" },
  ],
  "Semua status",
);

/**
 * The orderings the API accepts — PURCHASE_RETURN_SORTS in purchaseReturn.model.js.
 *
 * BY THE DATE THE GOODS WENT BACK, not by when the row was written. `returnDate`
 * is the day the collection actually happened, which is the date printed on the
 * row and the one the journal posts against; a return the courier took on the
 * 31st and somebody keyed in on the 2nd would sort wrongly under the other one.
 *
 * The number orderings walk a SEQUENCE rather than a calendar. The return number
 * is ours and sequential — allocated when the draft is opened — and it is what
 * the supplier quotes on their credit note, so ordering by it is how somebody
 * reconciles against that note.
 *
 * NOTHING BY NILAI, and nothing by STATUS. The first is an unindexed Decimal128,
 * so it would be a blocking in-memory sort; the second has two values, so it
 * would group rather than order — and grouping is what the Status FILTER above
 * already does, better, because it also fixes the pager's total to the group
 * being read.
 */
const SORTS: FilterOption<PurchaseReturnSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "numberDesc", label: "Nomor Z–A" },
  { value: "numberAsc", label: "Nomor A–Z" },
];

/** Everything the panel edits, as one draft. */
interface ReturnFilters {
  supplierId: string;
  warehouseId: string;
  status: PurchaseReturnsQuery["status"];
  dateFrom: string;
  dateTo: string;
  sort: PurchaseReturnSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: ReturnFilters = {
  supplierId: "",
  warehouseId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

export function PurchaseReturnsToolbar({
  query,
  onChange,
}: {
  query: PurchaseReturnsQuery;
  onChange: (patch: Partial<PurchaseReturnsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  const applied: ReturnFilters = {
    supplierId: query.supplierId,
    warehouseId: query.warehouseId,
    status: query.status,
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
  function apply(next: ReturnFilters) {
    const patch: Partial<PurchaseReturnsQuery> = {};
    if (next.supplierId !== query.supplierId) patch.supplierId = next.supplierId;
    if (next.warehouseId !== query.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.status !== query.status) patch.status = next.status;
    if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the triggers
      // collapsed there is nothing else on the line that grows, and what people
      // type here is a return number they are reading off a credit note.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all three, so the create button takes a
      // line of its own — and takes all of it. A button hugging its label at one
      // end of an otherwise empty row reads as something left behind.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nomor retur…"
          ariaLabel="Cari retur"
          fill
        />
      }
      actions={
        <Can feature="purchaseReturns" action="create">
          <Button asChild className="w-full">
            <Link href="/dashboard/purchasing/returns/new">
              <Plus className="size-4" />
              Buat retur
            </Link>
          </Button>
        </Can>
      }
    >
      <ReturnFilterPanel
        applied={applied}
        suppliers={suppliers}
        warehouses={warehouses}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The four filters and the ordering, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function ReturnFilterPanel({
  applied,
  suppliers,
  warehouses,
  onApply,
}: {
  applied: ReturnFilters;
  suppliers: Supplier[];
  warehouses: StockWarehouse[];
  onApply: (next: ReturnFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE RANGE COUNTS ONCE, not twice — one bound or both, it is one question
   * somebody asked. THE ORDERING IS NOT COUNTED AT ALL: every list has one, so
   * it is never "on", and a badge reading `Filter (1)` over an unnarrowed screen
   * would train people to ignore the number.
   */
  const count = [
    applied.supplierId !== "",
    applied.warehouseId !== "",
    applied.status !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<ReturnFilters>) {
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
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          options={withAll(namedOptions(warehouses), "Semua gudang")}
          onChange={(warehouseId) => patch({ warehouseId })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
        />
        <FilterDateRange
          layout="field"
          label="Tanggal retur"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
        />
      </FilterPanel>
    </>
  );
}
