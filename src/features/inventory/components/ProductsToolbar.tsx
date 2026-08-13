"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * useProducts. The "all" sentinels exist because Radix Select forbids an empty
 * item value, exactly as in CustomersToolbar.
 *
 * THE WAREHOUSE PICKER IS NOT PART OF THE QUERY. Every product response already
 * carries its quantities for every warehouse, so changing the selection re-reads
 * what is on screen instead of re-fetching it — which is why it lives beside the
 * filters but is handed a separate setter.
 */
const ALL = "all";

const TYPE_FILTERS: Array<{ value: ProductType | typeof ALL; label: string }> =
  [
    { value: ALL, label: "Semua tipe" },
    { value: "standalone", label: "Standalone" },
    { value: "parent", label: "Punya varian" },
    { value: "bundle", label: "Bundle" },
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Cari nama atau SKU…"
          value={query.search}
          onChange={(event) => onChange({ search: event.target.value })}
          className="max-w-xs"
          aria-label="Cari produk"
        />

        <Select
          value={query.productType === "" ? ALL : query.productType}
          onValueChange={(value) =>
            onChange({
              productType: value === ALL ? "" : (value as ProductType),
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Filter tipe">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.categoryId === "" ? ALL : query.categoryId}
          onValueChange={(value) =>
            onChange({ categoryId: value === ALL ? "" : value })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua kategori</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category._id} value={category._id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.status === "" ? ALL : query.status}
          onValueChange={(value) =>
            onChange({
              status: value === ALL ? "" : (value as "active" | "inactive"),
            })
          }
        >
          <SelectTrigger className="w-36" aria-label="Filter status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Nonaktif</SelectItem>
          </SelectContent>
        </Select>

        <WarehouseFilter
          warehouses={warehouses}
          selected={warehouseIds}
          onChange={onWarehouseChange}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="includeDeleted"
            checked={query.includeDeleted}
            onCheckedChange={(checked) =>
              onChange({ includeDeleted: checked === true })
            }
          />
          <Label htmlFor="includeDeleted" className="text-xs text-muted">
            Tampilkan produk terhapus
          </Label>
        </div>

        <Can feature="products" action="create">
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/dashboard/inventory/products/new?type=bundle">
                + Bundle
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/inventory/products/new">
                + Produk baru
              </Link>
            </Button>
          </div>
        </Can>
      </div>
    </div>
  );
}

/**
 * Which warehouses the Stok column is reported for — any number of them.
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
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {/* The caption is half the control's name — "Gudang: 2 gudang" says
          nothing about what the choice does to the page, and this button is the
          only thing on the toolbar that changes a number rather than a row. */}
      <span
        id="warehouse-scope-caption"
        className="text-[10px] font-medium tracking-[0.14em] text-muted uppercase"
      >
        Stok ditampilkan untuk
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-52 justify-between border-input bg-transparent font-normal"
            aria-labelledby="warehouse-scope-caption warehouse-scope-value"
            title={names.length > 1 ? names.join(", ") : undefined}
          >
            <span id="warehouse-scope-value" className="truncate">
              {label}
            </span>
            <ChevronDownIcon className="size-4 opacity-50" />
          </Button>
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
    </div>
  );
}
