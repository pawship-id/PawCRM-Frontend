/**
 * Public surface of the inventory feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the routes under /dashboard/inventory: the hub, the catalogue (list +
 * detail + form), the stock card (index + one product's card), the batch report,
 * stock opname (list + sheet), the adjustment form and the transfer form.
 */
export { InventoryHub } from "./components/InventoryHub";
export { ProductsScreen } from "./components/ProductsScreen";
export { ProductDetail } from "./components/ProductDetail";
export { ProductForm } from "./components/ProductForm";
export { ImportScreen } from "./components/ImportScreen";
export { StockProductsScreen } from "./components/StockProductsScreen";
export { StockCardScreen } from "./components/StockCardScreen";
export { BatchesScreen } from "./components/BatchesScreen";
export { OpnameScreen } from "./components/OpnameScreen";
export { OpnameSheet } from "./components/OpnameSheet";
export { OpnameStatusBadge } from "./components/OpnameStatusBadge";
export { StockAdjustmentForm } from "./components/StockAdjustmentForm";
export { StockTransferForm } from "./components/StockTransferForm";

/**
 * The two stock alerts, exported because the DASHBOARD renders them too.
 *
 * They were internal while only the inventory hub used them. PCR-013 and
 * PCR-018 both put these cards on the dashboard specifically, so a second
 * feature now consumes them — and a second copy of "what counts as low" is
 * exactly the drift this barrel exists to prevent. Both take an `enabled` flag
 * so the caller's permission check decides whether the request is made at all.
 */
export { useLowStockAlert } from "./hooks/useLowStockAlert";
export type { LowStockProduct } from "./hooks/useLowStockAlert";
export { useExpiringAlert } from "./hooks/useExpiringAlert";
