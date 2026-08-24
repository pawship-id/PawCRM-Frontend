/**
 * Public surface of the customers feature (Master Data → Customer).
 *
 * Pages import from here, never from deep component paths. The three screen
 * entry points map onto the three routes: list, create, edit.
 */
export { CustomersScreen } from "./components/CustomersScreen";
export { CustomerCreateForm } from "./components/CustomerCreateForm";
export { CustomerEditForm } from "./components/CustomerEditForm";
/**
 * The two the POS reaches for. Exported from the feature's public surface so the
 * till imports from here rather than reaching into `components/`.
 */
export { CustomerSearchDialog } from "./components/CustomerSearchDialog";
export { CustomerQuickAddDialog } from "./components/CustomerQuickAddDialog";
