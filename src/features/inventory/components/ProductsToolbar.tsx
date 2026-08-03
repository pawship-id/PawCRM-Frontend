"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import type { ProductsQuery } from "../hooks/useProducts";

/**
 * The catalogue's controls: search, the type and category filters, the deleted
 * toggle, the warehouse the Stok column is reported for, and the two create
 * entry points.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useProducts. The "all" sentinels exist because Radix Select forbids an empty
 * item value, exactly as in CustomersToolbar.
 *
 * THE WAREHOUSE SELECT IS NOT PART OF THE QUERY. Every product response already
 * carries its quantities for every warehouse, so switching location re-reads
 * what is on screen instead of re-fetching it — which is why it lives beside the
 * filters but is handed a separate setter.
 */
const ALL = "all";

const TYPE_FILTERS: Array<{ value: ProductType | typeof ALL; label: string }> = [
  { value: ALL, label: "Semua tipe" },
  { value: "standalone", label: "Standalone" },
  { value: "parent", label: "Punya varian" },
  { value: "bundle", label: "Bundle" },
];

export function ProductsToolbar({
  query,
  categories,
  warehouses,
  warehouseId,
  onWarehouseChange,
  onChange,
}: {
  query: ProductsQuery;
  categories: Category[];
  warehouses: StockWarehouse[];
  warehouseId: string;
  onWarehouseChange: (id: string) => void;
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
            Stok ditampilkan untuk
          </span>
          <Select value={warehouseId} onValueChange={onWarehouseChange}>
            <SelectTrigger className="w-52" aria-label="Gudang">
              <SelectValue placeholder="Pilih gudang" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              <Link href="/dashboard/inventory/products/new">+ Produk baru</Link>
            </Button>
          </div>
        </Can>
      </div>
    </div>
  );
}
