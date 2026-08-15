"use client";

import Link from "next/link";

import {
  FilterBar,
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
import { Can } from "@/features/permissions";
import type { Category } from "@/types/api";
import type { ProductType, StockWarehouse } from "@/types/inventory";

import type { WarehouseScope } from "../utils/catalogue";
import type { ProductsQuery } from "../hooks/useProducts";

/**
 * The catalogue's controls: search, the type and category filters, the deleted
 * toggle, the warehouses the Stok column is reported for, and the two create
 * entry points.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useProducts.
 *
 * THE WAREHOUSE PICKER IS NOT PART OF THE QUERY. Every product response already
 * carries its quantities for every warehouse, so changing the selection re-reads
 * what is on screen instead of re-fetching it — which is why it lives beside the
 * filters but is handed a separate setter, and why it is the one control here
 * that is not a FilterSelect.
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
  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau SKU…"
          ariaLabel="Cari produk"
        />
      }
      actions={
        <Can feature="products" action="create">
          {/*
            Import sits FIRST and quietest of the three. It is the entry point
            for a catalogue that does not exist yet — a tenant's first day —
            while the other two are what everyone uses forever after.
          */}
          <Button variant="secondary" asChild>
            <Link href="/dashboard/inventory/products/import">Import</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/dashboard/inventory/products/new?type=bundle">
              + Bundle
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/inventory/products/new">+ Produk baru</Link>
          </Button>
        </Can>
      }
    >
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
        options={withAll(namedOptions(categories), "Semua kategori")}
        onChange={(categoryId) => onChange({ categoryId })}
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status"
        value={query.status}
        options={STATUSES}
        onChange={(status) => onChange({ status })}
      />
      <FilterToggle
        label="Tampilkan produk terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />

      <WarehouseFilter
        warehouses={warehouses}
        selected={warehouseIds}
        onChange={onWarehouseChange}
      />
    </FilterBar>
  );
}

/**
 * Which warehouses the Stok column is reported for — any number of them.
 *
 * NOT A FilterMultiSelect, and deliberately so. That control holds a draft
 * behind a Terapkan because picking several things is usually one decision;
 * this one applies on every tick because it changes a column on data already in
 * hand rather than asking the server a new question. It also inverts the empty
 * case, and its trigger label is a count rather than a value. Bending the shared
 * control around those three would put four props on it for one call site —
 * which is the failure mode this whole folder exists to avoid.
 *
 * What it DOES share is the shell: FilterTrigger, so it sits in the row looking
 * like everything beside it, and a design change still lands in one file.
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
function WarehouseFilter({
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger
          // The caption is half the control's name — "Gudang: 2 gudang" says
          // nothing about what the choice does to the page, and this is the only
          // control on the toolbar that changes a number rather than a row. It
          // used to be a separate span wired with aria-labelledby; inside the
          // shared trigger it is simply the label, and the aria-label repeats it
          // so the accessible name still reads as one phrase.
          label="Stok ditampilkan untuk"
          value={label}
          active={selected.length > 0}
          aria-label={`Stok ditampilkan untuk ${label}`}
          title={names.length > 1 ? names.join(", ") : undefined}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-52">
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
}
