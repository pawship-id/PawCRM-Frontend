"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import type { Category } from "@/types/api";
import type { ProductSort } from "@/types/inventory";

import type { StockProductsQuery } from "../hooks/useStockProducts";

/**
 * The stock-card index's controls: one row — search and one Filter button — with
 * the ordering, the category, the status and the deleted toggle inside a panel.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useStockProducts, which owns it.
 *
 * THE WAREHOUSE IS NOT HERE, and that is the one thing worth reading twice. It
 * sits beside the page heading instead, because it narrows nothing: the API has
 * no `warehouseId` on this list, every row arrives with its quantities for every
 * location, and the choice picks which number a row shows and which shelf its
 * link opens. Rule §8 already names this for this module — Gudang stays outside
 * the panel as a required input, not a filter.
 *
 * NOTHING HERE MAY BE DERIVED FROM A QUANTITY. "Sembunyikan stok 0" and "stok
 * menipis" both read `stockByWarehouse` off rows the server has already paged,
 * so filtering on them would leave `pagination.total` describing one set and the
 * table showing another — a page of twenty rendering as six, and page 2 filtered
 * from a different subset. It is the same refusal useProducts writes down for
 * `excludeVariants`: the exclusion has to happen where the count does. Ordering
 * by stock is out for the same reason — the server cannot sort by a number it
 * was never asked to compute.
 */

const STATUSES: FilterOption<StockProductsQuery["status"]>[] = [
  { value: "", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

/**
 * The orderings the API accepts — PRODUCT_SORTS in product.model.js, minus the
 * two this screen cannot use.
 *
 * NO "STOK". See the header: the quantity is assembled per row from an array the
 * server does not order by. Name and SKU lead, because this list is scanned for
 * a product somebody is already holding or already knows the name of.
 */
const SORTS: FilterOption<ProductSort>[] = [
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
  { value: "skuAsc", label: "SKU A–Z" },
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
];

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  categoryId: string;
  status: StockProductsQuery["status"];
  includeDeleted: boolean;
  sort: ProductSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to A–Z rather than clearing it to nothing.
 */
const CLEARED: PanelFilters = {
  categoryId: "",
  status: "",
  includeDeleted: false,
  sort: "nameAsc",
};

export function StockProductsToolbar({
  query,
  categories,
  disabled,
  onChange,
}: {
  query: StockProductsQuery;
  categories: Category[];
  /** True while there is nothing to filter — no `products:read`. */
  disabled: boolean;
  onChange: (patch: Partial<StockProductsQuery>) => void;
}) {
  const applied: PanelFilters = {
    categoryId: query.categoryId,
    status: query.status,
    includeDeleted: query.includeDeleted,
    sort: query.sort,
  };

  /**
   * Commits the draft, sending only what actually moved — the list is re-fetched
   * on any change to the query object, so posting every field back would
   * re-query after a Terapkan that changed nothing.
   */
  function apply(next: PanelFilters) {
    const patch: Partial<StockProductsQuery> = {};
    if (next.categoryId !== query.categoryId) patch.categoryId = next.categoryId;
    if (next.status !== query.status) patch.status = next.status;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows, and
      // product names are long.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau SKU…"
          ariaLabel="Cari produk"
          disabled={disabled}
          fill
        />
      }
    >
      <StockProductsFilterPanel
        applied={applied}
        categoryOptions={withAll(namedOptions(categories), "Semua kategori")}
        disabled={disabled}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The ordering, the category, the status and the deleted toggle, behind one
 * button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function StockProductsFilterPanel({
  applied,
  categoryOptions,
  disabled,
  onApply,
}: {
  applied: PanelFilters;
  categoryOptions: FilterOption<string>[];
  disabled: boolean;
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list. THE ORDERING IS NOT COUNTED —
   * every list has one, so a badge reading `Filter (1)` over an unnarrowed list
   * would teach people to ignore the number.
   */
  const count = [
    applied.categoryId !== "",
    applied.status !== "",
    applied.includeDeleted,
  ].filter(Boolean).length;

  function patch(change: Partial<PanelFilters>) {
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
        disabled={disabled}
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
          unsetValue="nameAsc"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Kategori"
          ariaLabel="Filter kategori"
          value={draft.categoryId}
          options={categoryOptions}
          onChange={(categoryId) => patch({ categoryId })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
        />
        {/*
          A DELETED PRODUCT STILL HAS A LEDGER, and until this toggle existed
          there was no way to open it: the old picker's header claimed deleted
          products were included and never sent `includeDeleted`. A product is
          soft-deleted precisely so its stock history keeps resolving, so the
          screen that reads that history is where the switch belongs.
        */}
        <FilterToggle
          label="Tampilkan produk terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
