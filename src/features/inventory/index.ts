/**
 * Public surface of the inventory feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the routes under /dashboard/inventory: the hub, the catalogue (list +
 * detail + form), the stock card, the batch report, stock opname (list + sheet),
 * the adjustment form and the transfer form.
 */
export { InventoryHub } from "./components/InventoryHub";
export { ProductsScreen } from "./components/ProductsScreen";
export { ProductDetail } from "./components/ProductDetail";
export { ProductForm } from "./components/ProductForm";
export { StockCardScreen } from "./components/StockCardScreen";
export { BatchesScreen } from "./components/BatchesScreen";
export { OpnameScreen } from "./components/OpnameScreen";
export { OpnameSheet } from "./components/OpnameSheet";
export { OpnameStatusBadge } from "./components/OpnameStatusBadge";
export { StockAdjustmentForm } from "./components/StockAdjustmentForm";
export { StockTransferForm } from "./components/StockTransferForm";
