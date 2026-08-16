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
import type { GoodsReceiptSort, PurchaseType, Supplier } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { GoodsReceiptsQuery } from "../hooks/useGoodsReceipts";

/**
 * The goods-receipt list controls: one row — search, one Filter button, one
 * create button — with the ordering, supplier, warehouse, purchase type and the
 * date range inside the panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useGoodsReceipts.
 *
 * ONE BUTTON RATHER THAN A ROW OF TRIGGERS, at every width, which is the
 * arrangement Produk & Varian and Stok Opname both use. §8 sends this screen to
 * a panel on the field count alone — five, once the ordering is one of them —
 * and the date range decides it a second time: a control that carries its own
 * Reset/Terapkan puts a screen in the panel column whatever else is on the bar.
 * On a phone the old row of four triggers wrapped onto three lines and pushed
 * the table off the fold.
 *
 * NO "TAMPILKAN TERHAPUS" TOGGLE, unlike the supplier panel. There is no
 * `DELETE /goods-receipts/:id` — a posted receipt is immutable — so no receipt
 * is ever in a deleted state to reveal. A toggle that can never change a result
 * is worse than no toggle: it reads as a promise the data cannot keep.
 *
 * THE DATE RANGE BOUNDS `receiptDate`, the day the goods arrived — never the day
 * the row was keyed in. A delivery unloaded last night and entered this morning
 * belongs to last night, and that is the date somebody reconciling a supplier
 * statement is searching by. It renders as a FIELD here rather than as its own
 * popover: a popover carrying its own Terapkan inside a panel carrying its own
 * Terapkan is two pairs of verbs for one decision, and the inner one commits
 * nothing a user can see.
 */
const TYPES = withAll<PurchaseType | "">(
  [
    { value: "beli_putus", label: "Beli putus" },
    { value: "konsinyasi", label: "Konsinyasi" },
  ],
  "Semua jenis",
);

/**
 * The orderings the API accepts — GOODS_RECEIPT_SORTS in goodsReceipt.model.js.
 *
 * BY ARRIVAL DATE, NOT BY WHEN THE ROW WAS WRITTEN. `receiptDate` is the day the
 * goods physically landed, which is the date printed on the row and the one
 * somebody means by "penerimaan terakhir"; a delivery unloaded last night and
 * keyed in this morning would sort above it under the other one.
 *
 * The number orderings are not a second date axis in disguise. They agree with
 * chronology most of the time — the number is drawn against the receipt date —
 * but they are how you walk a sequence against a supplier statement rather than
 * a calendar, and they break the intra-day tie by the numbering instead of by
 * insertion order.
 *
 * NOTHING BY VALUE, though "termahal dulu" is a fair question: `total` is
 * unindexed and a busy tenant has thousands of receipts, so the ordering the
 * model refuses is the one that could take this screen down.
 */
const SORTS: FilterOption<GoodsReceiptSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "numberDesc", label: "Nomor Z–A" },
  { value: "numberAsc", label: "Nomor A–Z" },
];

/** Everything the panel edits, as one draft. */
interface ReceiptFilters {
  supplierId: string;
  warehouseId: string;
  purchaseType: GoodsReceiptsQuery["purchaseType"];
  dateFrom: string;
  dateTo: string;
  sort: GoodsReceiptSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: ReceiptFilters = {
  supplierId: "",
  warehouseId: "",
  purchaseType: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

export function ReceiptsToolbar({
  query,
  onChange,
}: {
  query: GoodsReceiptsQuery;
  onChange: (patch: Partial<GoodsReceiptsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  const applied: ReceiptFilters = {
    supplierId: query.supplierId,
    warehouseId: query.warehouseId,
    purchaseType: query.purchaseType,
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
  function apply(next: ReceiptFilters) {
    const patch: Partial<GoodsReceiptsQuery> = {};
    if (next.supplierId !== query.supplierId) patch.supplierId = next.supplierId;
    if (next.warehouseId !== query.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.purchaseType !== query.purchaseType)
      patch.purchaseType = next.purchaseType;
    if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the triggers
      // collapsed there is nothing else on the line that grows, and what people
      // type here is a receipt number they are reading off a delivery note.
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
          // Names exactly the two fields the API searches — a placeholder
          // promising a field the server does not match is a bug report
          // waiting to be filed.
          placeholder="Cari nomor penerimaan atau catatan…"
          ariaLabel="Cari penerimaan"
          fill
        />
      }
      actions={
        <Can feature="goodsReceipts" action="create">
          <Button asChild className="w-full">
            <Link href="/dashboard/purchasing/receipts/new">
              <Plus className="size-4" />
              Terima barang
            </Link>
          </Button>
        </Can>
      }
    >
      <ReceiptFilterPanel
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
function ReceiptFilterPanel({
  applied,
  suppliers,
  warehouses,
  onApply,
}: {
  applied: ReceiptFilters;
  suppliers: Supplier[];
  warehouses: StockWarehouse[];
  onApply: (next: ReceiptFilters) => void;
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
    applied.purchaseType !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<ReceiptFilters>) {
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
          label="Jenis"
          ariaLabel="Filter jenis pembelian"
          value={draft.purchaseType}
          options={TYPES}
          onChange={(purchaseType) => patch({ purchaseType })}
        />
        <FilterDateRange
          layout="field"
          label="Tanggal terima"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
        />
      </FilterPanel>
    </>
  );
}
