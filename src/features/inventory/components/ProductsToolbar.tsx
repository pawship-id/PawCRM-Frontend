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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Can } from "@/features/permissions";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { Category } from "@/types/api";
import type { ProductType, StockWarehouse } from "@/types/inventory";

import type { WarehouseScope } from "../utils/catalogue";
import type { ProductsQuery } from "../hooks/useProducts";
import { NewProductMenu } from "./NewProductMenu";

/**
 * The catalogue's controls: search, the type/category/warehouse filters, and the
 * two rare ones behind "Filter lain".
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useProducts.
 *
 * THE BAR HAS FIVE FILTERS AND ROOM FOR THREE. Rule §8 gives this screen a quick
 * bar, and a quick bar is one line: with search and the actions on it too, five
 * triggers wrap into a second row that looks like a mistake. So the two nobody
 * touches daily — whether to show inactive products, and whether to show deleted
 * ones — move behind a `Filter lain` popover with its own Reset and Terapkan,
 * which is the escape hatch the filter spec names for exactly this. They are
 * also the pair that belongs together: both ask whether a product is still in
 * play, and neither is a question anyone opens the catalogue to ask.
 *
 * BELOW 600px THE BAR IS NOT A BAR. Four triggers and a search stacked on a
 * phone is a screen of controls above a table nobody can see, so all five
 * filters collapse into a single `Filter` button opening a FilterPanel
 * — the same arrangement rule §8 gives a module with eight fields, reached here
 * because of the viewport rather than the field count. The two are branches of
 * one component rather than two trees hidden from each other by CSS: two copies
 * of "Kategori" in the DOM is one control for a sighted user and two for
 * everyone else.
 *
 * THE WAREHOUSE PICKER IS NOT PART OF THE QUERY. Every product response already
 * carries its quantities for every warehouse, so changing the selection re-reads
 * what is on screen instead of re-fetching it — which is why it sits beside the
 * filters but is handed a separate setter.
 */
const TYPE_FILTERS = withAll<ProductType | "">(
  [
    { value: "standalone", label: "Standalone" },
    { value: "parent", label: "Punya varian" },
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
 * The width at which the bar stops being one. Not a Tailwind breakpoint: `sm`
 * (640) is a hair too late — at 600 the three triggers already fit — and the
 * number belongs to this layout rather than to the scale.
 */
const BAR_FITS = "(min-width: 600px)";

/** Everything the filters hold, in the shape the panel edits it as a draft. */
interface CatalogueFilters {
  productType: ProductsQuery["productType"];
  categoryId: string;
  status: ProductsQuery["status"];
  includeDeleted: boolean;
  /** Empty means every warehouse — see WarehouseField. */
  warehouseIds: string[];
}

/**
 * Whether two warehouse selections are the same set. Order is never meaningful
 * — the picker appends in tick order — so it is compared as a set, and a fresh
 * array holding the same ids is not a change worth re-rendering the table for.
 */
function sameScope(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

const CLEARED: CatalogueFilters = {
  productType: "",
  categoryId: "",
  status: "",
  includeDeleted: false,
  warehouseIds: [],
};

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
  // The wide bar is the fallback: it is what the server prerenders, so a desktop
  // load never starts collapsed. A phone corrects itself on hydration.
  const compact = !useMediaQuery(BAR_FITS, true);

  const applied: CatalogueFilters = {
    productType: query.productType,
    categoryId: query.categoryId,
    status: query.status,
    includeDeleted: query.includeDeleted,
    warehouseIds: [...warehouseIds],
  };

  /**
   * Commits a whole draft — the query half to useProducts, the view half here.
   *
   * ONLY WHAT ACTUALLY MOVED. A panel hands back every field it holds, and
   * `setQuery` builds a new object out of whatever it is passed — which the
   * fetch effect keys on by identity. Posting all four back would mean pressing
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

    if (Object.keys(patch).length > 0) onChange(patch);
    if (!sameScope(nextWarehouses, warehouseIds))
      onWarehouseChange(nextWarehouses);
  }

  const categoryOptions = withAll(namedOptions(categories), "Semua kategori");

  return (
    <FilterBar
      /*
        WIDE: filters on one line, then search and the create menu on a line of
        their own. Four triggers already fill the first line, and a search box
        that flex-wrap parks wherever there happened to be room is one people
        have to hunt for after every filter change.

        NARROW: one wrapping row instead. Search takes the whole first line, so
        the `Filter` button and the create menu fall onto the second together
        and nearly fill it — three stacked full-width controls above a table
        nobody can see yet is the thing to avoid on a phone.
      */
      searchPlacement={compact ? "inline" : "own-row"}
      searchClassName={compact ? "order-first w-full" : undefined}
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau SKU…"
          ariaLabel="Cari produk"
          // Wider than the shared default, because here it has a row to itself
          // rather than a gap at the end of the filters — and what gets typed
          // into it is product names, which run long. Both halves of the pair
          // are needed: the shared `sm:max-w-xs` would otherwise win back above
          // 640px and leave this capped only in the 600–640 band.
          className={compact ? "max-w-none" : "max-w-md sm:max-w-md"}
        />
      }
      actions={
        <Can feature="products" action="create">
          <NewProductMenu />
        </Can>
      }
    >
      {compact ? (
        <CompactFilters
          applied={applied}
          categoryOptions={categoryOptions}
          warehouses={warehouses}
          onApply={apply}
        />
      ) : (
        <>
          <FilterSelect
            label="Tipe"
            ariaLabel="Filter tipe"
            value={query.productType}
            options={TYPE_FILTERS}
            onChange={(productType) => onChange({ productType })}
          />
          <FilterSelect
            label="Kategori"
            ariaLabel="Filter kategori"
            value={query.categoryId}
            options={categoryOptions}
            onChange={(categoryId) => onChange({ categoryId })}
          />
          {/*
            On the bar this one applies on every tick rather than behind a
            Terapkan, which no other multi-select in the app does. It is not a
            query: every product already arrives carrying its quantities for
            every warehouse, so ticking a location re-reads the page instead of
            asking the server anything. A draft would make people confirm a
            change they can already see.
          */}
          <WarehouseField
            warehouses={warehouses}
            selected={warehouseIds}
            onChange={onWarehouseChange}
          />
          <MoreFilters applied={applied} onApply={apply} />
        </>
      )}
    </FilterBar>
  );
}

/**
 * The rare pair — active status and deleted products — behind one trigger.
 *
 * Its own Reset and Terapkan: two combined fields are a panel, and a panel gets
 * one pair of verbs (§8). Both are about whether a product is still in play,
 * which is why they are the two that travel together off the bar.
 */
function MoreFilters({
  applied,
  onApply,
}: {
  applied: CatalogueFilters;
  onApply: (next: CatalogueFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const active = applied.includeDeleted || applied.status !== "";

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label="Filter lain"
          active={active}
          icon={<ListFilter className="size-4" />}
          aria-label="Filter lain"
        />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="space-y-4 p-4">
          <FilterSelect
            layout="field"
            label="Status"
            ariaLabel="Filter status"
            value={draft.status}
            options={STATUSES}
            onChange={(status) => setDraft((prev) => ({ ...prev, status }))}
          />
          <FilterToggle
            label="Tampilkan produk terhapus"
            checked={draft.includeDeleted}
            onChange={(includeDeleted) =>
              setDraft((prev) => ({ ...prev, includeDeleted }))
            }
          />
        </div>

        {/* The same footer FilterMultiSelect carries, for the same reason: this
            popover is one composed decision, so it needs one pair of verbs. */}
        <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              // Reset applies at once, at every level — clearing a filter is
              // not a change anyone composes.
              onApply({ ...applied, status: "", includeDeleted: false });
              setOpen(false);
            }}
            className="rounded-sm text-sm font-semibold text-warning outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reset
          </button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The whole bar as one button, for a screen too narrow to lay it out.
 *
 * Every filter is in the panel, including the three that auto-apply on the wide
 * bar: inside a panel they wait for Terapkan (§8), because the panel exists so
 * the table is queried once for a decision someone made in one sitting.
 */
function CompactFilters({
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
          layout="field"
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
 * NOT A FilterMultiSelect, and deliberately so. That control holds a draft
 * behind a Terapkan because picking several things is usually one decision;
 * this one applies on every tick, because it changes a column on data already
 * in hand rather than asking the server a new question. It also inverts the
 * empty case, and its trigger label is a count rather than a value. Bending the
 * shared control around those three would put four props on it for one call
 * site — the failure mode this whole folder exists to avoid.
 *
 * What it DOES share is the shell: FilterTrigger, and FilterField when it is
 * inside the panel — so it sits in the bar looking like the selects beside it
 * and in the panel looking like the ones above it, and a design change still
 * lands in one file.
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
  layout = "inline",
}: {
  warehouses: StockWarehouse[];
  selected: WarehouseScope;
  onChange: (ids: string[]) => void;
  layout?: "inline" | "field";
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

  const control = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger
          layout={layout}
          // The caption says STOK, not "Gudang" — this is the only control on
          // the bar that changes a number rather than which rows are on the
          // page, and "Gudang: 2 gudang" would have said nothing about that.
          // The aria-label repeats it so the accessible name reads as one
          // phrase either way, since in the panel the caption is drawn above.
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
  );

  if (layout === "field") {
    return (
      <FilterField label="Stok gudang">{control}</FilterField>
    );
  }

  return control;
}
