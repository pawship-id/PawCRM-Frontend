"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product, StockWarehouse } from "@/types/inventory";

/**
 * The warehouse + product pair every stock screen starts from.
 *
 * Extracted because all the stock screens ask the same two questions, and
 * getting them out of step — one calling it "gudang", another "lokasi" — is how
 * a set of forms stops feeling like one module.
 *
 * TWO FILTERS, both matching a backend rule rather than a preference:
 *
 *   warehouses — ACTIVE only. An inactive warehouse still owns its stock and its
 *                history, but must not accept new movement, so offering it would
 *                only produce a rejection after the user had filled the form.
 *   products   — only the types that can HOLD stock. A `parent` is an
 *                abstraction over its variants and a `bundle` consumes its
 *                components; the API refuses a movement against either, so
 *                listing them would be an invitation to a 400.
 */
export function WarehouseProductPicker({
  warehouses,
  products,
  warehouseId,
  productId,
  onWarehouseChange,
  onProductChange,
  warehouseLabel = "Gudang",
}: {
  warehouses: StockWarehouse[];
  products: Product[];
  warehouseId: string;
  productId: string;
  onWarehouseChange: (id: string) => void;
  onProductChange: (id: string) => void;
  warehouseLabel?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="warehouse">{warehouseLabel}</Label>
        <Select value={warehouseId} onValueChange={onWarehouseChange}>
          <SelectTrigger id="warehouse" aria-label={warehouseLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {warehouses
              .filter((warehouse) => warehouse.isActive)
              .map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product">Produk</Label>
        <Select value={productId} onValueChange={onProductChange}>
          <SelectTrigger id="product" aria-label="Produk">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {products
              .filter(
                (product) =>
                  product.productType === "standalone" ||
                  product.productType === "variant",
              )
              .map((product) => (
                <SelectItem key={product._id} value={product._id}>
                  {product.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
