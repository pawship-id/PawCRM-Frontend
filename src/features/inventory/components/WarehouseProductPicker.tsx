"use client";

import { FilterSelect, namedOptions } from "@/components";
import type { Product, StockWarehouse } from "@/types/inventory";

/**
 * The warehouse + product pair every stock screen starts from.
 *
 * Extracted because all the stock screens ask the same two questions, and
 * getting them out of step — one calling it "gudang", another "lokasi" — is how
 * a set of forms stops feeling like one module.
 *
 * THE FILTER SHELL ON A FORM, which FilterTrigger is exported to allow. These
 * two pick from the same lists as the filter panels elsewhere in the module, and
 * a second select convention on one screen is a second thing to recognise for no
 * gain. The product list also gets the popover's own search for free, which
 * matters more here than anywhere: it is a whole catalogue, and the list feeding
 * it (`useStockCardLookups`) stops at 500 products. A form that needs more than
 * that wants what the stock card did — a searched, server-paged list — rather
 * than a taller dropdown.
 *
 * `active={false}` on both. The trigger's navy state means "a filter is
 * applied", and these are not filters — nothing is narrowed by choosing a
 * warehouse here, the screen simply cannot load until one is chosen.
 *
 * TWO FILTERS ON THE OPTIONS, both matching a backend rule rather than a
 * preference:
 *
 *   warehouses — ACTIVE only. An inactive warehouse still owns its stock and its
 *                history, but must not accept new movement, so offering it would
 *                only produce a rejection after the user had filled the form.
 *   products   — only the types that can HOLD stock. A `parent` is an
 *                abstraction over its variants and a `bundle` consumes its
 *                components; the API refuses a movement against either, so
 *                listing them would be an invitation to a 400.
 *
 * `includeInactiveWarehouses` lifts the first filter, and only a READ-ONLY
 * screen may pass it — a deactivated warehouse still owns everything it ever
 * held, and a history nobody can open is an audit hole. No caller passes it
 * today: the stock card did, until its product picker became a route and its
 * warehouse select moved to the page heading. What is left here are the FORMS,
 * which leave it off because for them an inactive warehouse is a rejection
 * waiting to happen.
 */
export function WarehouseProductPicker({
  warehouses,
  products,
  warehouseId,
  productId,
  onWarehouseChange,
  onProductChange,
  warehouseLabel = "Gudang",
  includeInactiveWarehouses = false,
  productPlaceholder,
}: {
  warehouses: StockWarehouse[];
  products: Product[];
  warehouseId: string;
  productId: string;
  onWarehouseChange: (id: string) => void;
  onProductChange: (id: string) => void;
  warehouseLabel?: string;
  includeInactiveWarehouses?: boolean;
  /** Shown before anything is chosen — a read screen may open with no selection. */
  productPlaceholder?: string;
}) {
  const selectableWarehouses = warehouses.filter(
    (warehouse) => includeInactiveWarehouses || warehouse.isActive,
  );

  const selectableProducts = products.filter(
    (product) =>
      product.productType === "standalone" || product.productType === "variant",
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FilterSelect
        layout="field"
        label={warehouseLabel}
        ariaLabel={warehouseLabel}
        value={warehouseId}
        options={namedOptions(selectableWarehouses, (warehouse) =>
          warehouse.isActive ? warehouse.name : `${warehouse.name} (nonaktif)`,
        )}
        active={false}
        placeholder="Pilih gudang"
        onChange={onWarehouseChange}
      />

      <FilterSelect
        layout="field"
        label="Produk"
        ariaLabel="Produk"
        value={productId}
        options={namedOptions(selectableProducts)}
        active={false}
        placeholder={productPlaceholder ?? "Pilih produk"}
        onChange={onProductChange}
      />
    </div>
  );
}
