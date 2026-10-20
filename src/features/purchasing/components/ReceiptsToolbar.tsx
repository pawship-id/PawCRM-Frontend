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
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type {
  Branch,
  GoodsReceiptStatusFilter,
  PurchaseType,
  Supplier,
} from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";
/**
 * THE SAME TWO RULES THE STOCK-ENTRIES FILTER USES, from the same place. Two
 * screens that scope by cabang and gudang in two different ways is a thing users
 * have to relearn, and the rules are subtle enough to drift if retyped.
 */
import {
  ownerBranchOf,
  warehousesUnder,
} from "@/features/inventory/hooks/useBranchScope";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { GoodsReceiptsQuery } from "../hooks/useGoodsReceipts";

/**
 * The goods-receipt list controls: one row — search, one Filter button, one
 * create button — with supplier, branch, warehouse, purchase type, status and
 * the date range inside the panel. The ordering is the table's headers (19
 * October 2026).
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useGoodsReceipts.
 *
 * ONE BUTTON RATHER THAN A ROW OF TRIGGERS, at every width, which is the
 * arrangement Produk & Varian and Stok Opname both use. §8 sends this screen to
 * a panel on the field count alone — six — and the date range decides it a
 * second time: a control that carries its own
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

/** Whether the goods are on the shelf yet. */
const STATUSES = withAll<GoodsReceiptStatusFilter | "">(
  [
    { value: "open", label: "Belum lengkap" },
    { value: "pending", label: "Belum diterima" },
    { value: "partial", label: "Diterima sebagian" },
    { value: "received", label: "Diterima lengkap" },
    { value: "closed", label: "Ditutup" },
  ],
  "Semua status",
);

/**
 * Everything the panel edits, as one draft. The ordering is NOT here: it lives
 * on the table's headers, and a Reset inside a filter panel must not silently
 * re-sort a table somebody ordered from the headers it can see
 * (docs/ui-rules.md §8).
 */
interface ReceiptFilters {
  supplierId: string;
  branchId: string;
  warehouseId: string;
  purchaseType: GoodsReceiptsQuery["purchaseType"];
  status: GoodsReceiptsQuery["status"];
  dateFrom: string;
  dateTo: string;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: ReceiptFilters = {
  supplierId: "",
  branchId: "",
  warehouseId: "",
  purchaseType: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export function ReceiptsToolbar({
  query,
  onChange,
}: {
  query: GoodsReceiptsQuery;
  onChange: (patch: Partial<GoodsReceiptsQuery>) => void;
}) {
  const { suppliers, warehouses, branches } = useReceiptFilterOptions();

  const applied: ReceiptFilters = {
    supplierId: query.supplierId,
    branchId: query.branchId,
    warehouseId: query.warehouseId,
    purchaseType: query.purchaseType,
    status: query.status,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
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
    if (next.branchId !== query.branchId) patch.branchId = next.branchId;
    if (next.warehouseId !== query.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.purchaseType !== query.purchaseType)
      patch.purchaseType = next.purchaseType;
    if (next.status !== query.status) patch.status = next.status;
    if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;

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
        branches={branches}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The six filters, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes. It leaves the ordering alone — that is the
 * table's headers.
 *
 * CABANG AND GUDANG ARE A PAIR, and they behave exactly as the stock-entries
 * panel's do — same helpers, same two rules — because two screens that scope by
 * the same two fields in two different ways is a thing users have to relearn.
 * See `pickBranch` and `pickWarehouse`.
 */
function ReceiptFilterPanel({
  applied,
  suppliers,
  warehouses,
  branches,
  onApply,
}: {
  applied: ReceiptFilters;
  suppliers: Supplier[];
  warehouses: StockWarehouse[];
  branches: Branch[];
  onApply: (next: ReceiptFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE RANGE COUNTS ONCE, not twice — one bound or both, it is one question
   * somebody asked. The ordering is not in this panel at all (it is the
   * table's headers), so it never reaches the count.
   */
  const count = [
    applied.supplierId !== "",
    // COUNTED SEPARATELY, unlike the date range's two bounds. Cabang and Gudang
    // are two questions that happen to be related, not one question with two
    // ends: "Cabang Selatan" and "Cabang Selatan, Gudang Timur" narrow the list
    // to different sets.
    applied.branchId !== "",
    applied.warehouseId !== "",
    applied.purchaseType !== "",
    applied.status !== "",
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

  /** What the chosen branch may have received at — its own, plus the shared. */
  const scoped = warehousesUnder(draft.branchId, warehouses);

  /**
   * A branch narrows the field below it, so a warehouse already chosen has to be
   * re-checked against the new list: one the picker no longer offers would sit
   * on the trigger as a raw id and send a pair no delivery matches. Kept when it
   * survives, because the central warehouse serves every branch and losing it on
   * each branch change would be a choice undone for nothing.
   */
  function pickBranch(branchId: string) {
    setDraft((prev) => ({
      ...prev,
      branchId,
      warehouseId: warehousesUnder(branchId, warehouses).some(
        (warehouse) => warehouse._id === prev.warehouseId,
      )
        ? prev.warehouseId
        : "",
    }));
  }

  /**
   * THE OTHER DIRECTION, and it is not symmetrical.
   *
   * A warehouse pinned to one branch ANSWERS the branch question, so the field
   * above fills itself in: "deliveries at Gudang Timur" and "deliveries at
   * Gudang Timur under any branch" are the same set, and leaving Cabang on
   * "Semua cabang" would leave a reader wondering whether it was still open.
   *
   * THE SHARED WAREHOUSE CHANGES NOTHING. It serves every branch, so there is no
   * single answer to volunteer; guessing one would narrow the list to a fraction
   * of what was asked for. "Semua gudang" lands here too and is left alone for
   * the same reason — it names no owner.
   */
  function pickWarehouse(warehouseId: string) {
    const owner = ownerBranchOf(warehouseId, warehouses);

    setDraft((prev) => ({
      ...prev,
      warehouseId,
      branchId: owner ?? prev.branchId,
    }));
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
          label="Supplier"
          ariaLabel="Filter supplier"
          value={draft.supplierId}
          options={withAll(namedOptions(suppliers), "Semua supplier")}
          onChange={(supplierId) => patch({ supplierId })}
        />
        {/* BRANCH BEFORE WAREHOUSE — widest scope first, the same order the
            table's columns read in and the same order every hand-typed stock
            form asks these two questions. */}
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(branches), "Semua cabang")}
          onChange={pickBranch}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          // SCOPED, not the whole list: a warehouse pinned to another branch
          // combined with this one is a pair no delivery can match, so offering
          // it could only produce an empty list nobody could explain.
          options={withAll(namedOptions(scoped), "Semua gudang")}
          onChange={pickWarehouse}
        />
        <FilterSelect
          layout="field"
          label="Jenis"
          ariaLabel="Filter jenis pembelian"
          value={draft.purchaseType}
          options={TYPES}
          onChange={(purchaseType) => patch({ purchaseType })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status penerimaan"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
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
