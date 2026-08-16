"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterField,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can } from "@/features/permissions";
import type { Category } from "@/types/api";
import type {
  ProductSort,
  ProductType,
  StockWarehouse,
} from "@/types/inventory";

import type { WarehouseScope } from "../utils/catalogue";
import type { ProductsQuery } from "../hooks/useProducts";
import { NewProductMenu } from "./NewProductMenu";

/**
 * The catalogue's controls: one row — search, one Filter button, one create
 * menu — with every filter and the sort order inside the panel.
 *
 * Purely presentational: it renders the current query and reports changes up to
 * useProducts.
 *
 * ONE BUTTON RATHER THAN A ROW OF TRIGGERS, at every width. Rule §8 hands a
 * quick bar to a screen of four-or-fewer single-selects, and this screen has six
 * things to set — type, category, warehouse scope, status, deleted, and now an
 * ordering. That is the panel's own threshold, and it is what the panel is for:
 * the table is queried once for a decision somebody made in one sitting, rather
 * than three times while they compose it.
 *
 * IT ALSO BUYS THE ROW BACK. With the triggers gone, search is the only thing
 * on the line that can usefully grow, so it takes everything the two buttons do
 * not — which matters because what people type here is product names, and the
 * old 320px box truncated them mid-word.
 *
 * THE PRICE IS THAT NOTHING IS VISIBLE AT A GLANCE. A quick bar shows its
 * current values on its triggers; a panel hides them behind a button, and a
 * hidden filter is one people forget is on and then read the wrong numbers
 * from. The count on the trigger (`Filter (2)`) is what pays that back — not
 * decoration, the whole reason the collapsed form is safe.
 *
 * THE WAREHOUSE PICKER IS NOT PART OF THE QUERY. Every product response already
 * carries its quantities for every warehouse, so changing the selection re-reads
 * what is on screen instead of re-fetching it — which is why it sits among the
 * filters but is handed a separate setter.
 */
const TYPE_FILTERS = withAll<ProductType | "">(
  [
    { value: "standalone", label: "Satuan" },
    { value: "parent", label: "Varian" },
    { value: "bundle", label: "Bundle" },
  ],
  "Semua tipe",
);

const STATUSES: FilterOption<ProductsQuery["status"]>[] = [
  { value: "", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

/**
 * The orderings the API accepts — PRODUCT_SORTS in product.model.js.
 *
 * NO "HARGA" OR "STOK" HERE, and their absence is deliberate. A parent and a
 * bundle carry no `sellPrice` of their own (the table prints "—"), so ordering
 * by price would sort a column that is empty for two of the three row types;
 * and stock is summed across whichever warehouses are picked, on the page, from
 * an array — the server cannot order by a number it has not been asked to
 * compute. Offering either would be a control that quietly does something else.
 */
const SORTS: FilterOption<ProductSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
  { value: "skuAsc", label: "SKU A–Z" },
];

/** Everything the panel edits, as one draft. */
interface CatalogueFilters {
  productType: ProductsQuery["productType"];
  categoryId: string;
  status: ProductsQuery["status"];
  includeDeleted: boolean;
  sort: ProductSort;
  /** Empty means every warehouse — see WarehouseField. */
  warehouseIds: string[];
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: CatalogueFilters = {
  productType: "",
  categoryId: "",
  status: "",
  includeDeleted: false,
  sort: "newest",
  warehouseIds: [],
};

/**
 * Whether two warehouse selections are the same set. Order is never meaningful
 * — the picker appends in tick order — so it is compared as a set, and a fresh
 * array holding the same ids is not a change worth re-rendering the table for.
 */
function sameScope(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function ProductsToolbar({
  query,
  categories,
  warehouses,
  warehouseIds,
  onWarehouseChange,
  onChange,
}: {
  query: ProductsQuery;
  categories: Category[];
  warehouses: StockWarehouse[];
  warehouseIds: WarehouseScope;
  onWarehouseChange: (ids: string[]) => void;
  onChange: (patch: Partial<ProductsQuery>) => void;
}) {
  const applied: CatalogueFilters = {
    productType: query.productType,
    categoryId: query.categoryId,
    status: query.status,
    includeDeleted: query.includeDeleted,
    sort: query.sort,
    warehouseIds: [...warehouseIds],
  };

  /**
   * Commits the draft — the query half to useProducts, the view half here.
   *
   * ONLY WHAT ACTUALLY MOVED. The panel hands back every field it holds, and
   * `setQuery` builds a new object out of whatever it is passed — which the
   * fetch effect keys on by identity. Posting all of it back would mean pressing
   * Terapkan after changing nothing but the warehouse scope re-queried the whole
   * catalogue, which is the one thing that control exists not to do.
   */
  function apply({ warehouseIds: nextWarehouses, ...rest }: CatalogueFilters) {
    const patch: Partial<ProductsQuery> = {};
    if (rest.productType !== query.productType)
      patch.productType = rest.productType;
    if (rest.categoryId !== query.categoryId) patch.categoryId = rest.categoryId;
    if (rest.status !== query.status) patch.status = rest.status;
    if (rest.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = rest.includeDeleted;
    if (rest.sort !== query.sort) patch.sort = rest.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
    if (!sameScope(nextWarehouses, warehouseIds))
      onWarehouseChange(nextWarehouses);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the triggers
      // collapsed there is nothing else on the line that grows, and product
      // names are long.
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
          placeholder="Cari nama atau SKU…"
          ariaLabel="Cari produk"
          fill
        />
      }
      actions={
        <Can feature="products" action="create">
          <NewProductMenu />
        </Can>
      }
    >
      <CatalogueFilterPanel
        applied={applied}
        categoryOptions={withAll(namedOptions(categories), "Semua kategori")}
        warehouses={warehouses}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * Every filter and the sort order, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns
 * the whole set to its defaults and applies at once, because clearing a filter
 * is not a change anyone composes.
 */
function CatalogueFilterPanel({
  applied,
  categoryOptions,
  warehouses,
  onApply,
}: {
  applied: CatalogueFilters;
  categoryOptions: FilterOption<string>[];
  warehouses: StockWarehouse[];
  onApply: (next: CatalogueFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE ORDERING IS NOT COUNTED. Every list has one, so it is never "on" — a
   * badge that read `Filter (1)` on a screen showing every product would train
   * people to ignore the number, which is the one thing here that must stay
   * worth reading.
   */
  const count = [
    applied.productType !== "",
    applied.categoryId !== "",
    applied.status !== "",
    applied.includeDeleted,
    applied.warehouseIds.length > 0,
  ].filter(Boolean).length;

  function patch(change: Partial<CatalogueFilters>) {
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
          label="Tipe"
          ariaLabel="Filter tipe"
          value={draft.productType}
          options={TYPE_FILTERS}
          onChange={(productType) => patch({ productType })}
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
        <WarehouseField
          warehouses={warehouses}
          selected={draft.warehouseIds}
          onChange={(warehouseIds) => patch({ warehouseIds })}
        />
        <FilterToggle
          label="Tampilkan produk terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}

/**
 * Which warehouses the Stok column is reported for — any number of them.
 *
 * NOT A FilterMultiSelect, and deliberately so. That control holds its own draft
 * behind its own Terapkan; this one sits inside a panel that already has a pair,
 * so a second pair inside it would ask the same question twice. It also inverts
 * the empty case, and its trigger reads a count rather than a value. Bending the
 * shared control around those three would put four props on it for one call
 * site — the failure mode this whole folder exists to avoid.
 *
 * What it DOES share is the shell: FilterField and FilterTrigger, so it sits in
 * the panel looking like the selects above it, and a design change still lands
 * in one file.
 *
 * A MENU OF CHECKBOXES RATHER THAN A SELECT, because Radix Select has no
 * multiple mode and a native `<select multiple>` is a ctrl-click affordance
 * nobody discovers. Ticking one keeps the menu open (see the ui wrapper): the
 * whole point of the control is picking several, and a menu that shut after each
 * tick would make three warehouses three trips.
 *
 * NOTHING TICKED IS "SEMUA GUDANG", not "no warehouses" — a stock column scoped
 * to nowhere would be a page of zeros, which is never what emptying a filter
 * means. So unticking the last one falls back to every location, and the "Semua
 * gudang" row is what that state looks like rather than a separate mode.
 *
 * The label is a COUNT past one, not a list of names: two names already overflow
 * the trigger and the truncation would land mid-name, which reads as a bug. The
 * names are still there on hover, and the ticks in the menu are the real answer.
 */
function WarehouseField({
  warehouses,
  selected,
  onChange,
}: {
  warehouses: StockWarehouse[];
  selected: WarehouseScope;
  onChange: (ids: string[]) => void;
}) {
  const names = warehouses
    .filter((warehouse) => selected.includes(warehouse._id))
    .map((warehouse) => warehouse.name);

  const label =
    selected.length === 0
      ? "Semua gudang"
      : // A name the lookup does not carry — an inactive warehouse, say — still
        // counts, so the fallback is the count rather than a shorter list.
        names.length === 1 && selected.length === 1
        ? names[0]
        : `${selected.length} gudang`;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }

  return (
    <FilterField label="Stok gudang">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            layout="field"
            // The caption says STOK, not "Gudang" — this is the only control
            // here that changes a number rather than which rows are on the
            // page. The aria-label repeats the field's own caption so the
            // accessible name still reads as one phrase.
            label="Stok gudang"
            value={label}
            active={selected.length > 0}
            aria-label={`Stok gudang ${label}`}
            title={names.length > 1 ? names.join(", ") : undefined}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuCheckboxItem
            checked={selected.length === 0}
            onCheckedChange={() => onChange([])}
          >
            Semua gudang
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {warehouses.map((warehouse) => (
            <DropdownMenuCheckboxItem
              key={warehouse._id}
              checked={selected.includes(warehouse._id)}
              onCheckedChange={() => toggle(warehouse._id)}
            >
              {warehouse.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterField>
  );
}
