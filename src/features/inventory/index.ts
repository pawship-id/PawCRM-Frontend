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
export { BatchLabelSheet } from "./components/BatchLabelSheet";
export { OpnameScreen } from "./components/OpnameScreen";
export { OpnameSheet } from "./components/OpnameSheet";
export { OpnameStatusBadge } from "./components/OpnameStatusBadge";
export { StockAdjustmentForm } from "./components/StockAdjustmentForm";
/**
 * Opening stock for products registered without any — the one screen that posts
 * `opening_balance`, and therefore the only one whose stock lands on capital
 * (3101) rather than on inventory loss (5201).
 */
export { OpeningStockForm } from "./components/OpeningStockForm";
/**
 * The hand-typed stock documents: their list and their detail. Both take a
 * `kind` — the two are the same table and the same reader over the same shape,
 * differing only in which account the value landed on.
 */
export { StockEntriesScreen } from "./components/StockEntriesScreen";
export { StockEntryDetail } from "./components/StockEntryDetail";
/**
 * Transfers: the list this route opens on, and the form behind its button.
 *
 * The list is NOT `StockEntriesScreen` with a third `kind`. Those two read one
 * collection of hand-typed DOCUMENTS; a transfer has none — it is a group of
 * ledger rows sharing a correlation id, with counts and a value that no stock
 * entry carries.
 */
export { StockTransfersScreen } from "./components/StockTransfersScreen";
/**
 * One transfer, read by its correlation id — what moved, from which lot, and at
 * what value. The list carries no value column: a transfer's worth is a dozen
 * products at their own averages, and one figure in a cell can neither be
 * checked nor traced to a product without opening the row anyway.
 */
export { StockTransferDetail } from "./components/StockTransferDetail";
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
