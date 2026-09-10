/**
 * Public surface of the customers feature (Master Data → Customer).
 *
 * Pages import from here, never from deep component paths. The three screen
 * entry points map onto the three routes: list, create, edit.
 */
export { CustomersScreen } from "./components/CustomersScreen";
/**
 * The module's shared chrome — the header carrying the title, the tab bar and
 * the register's counts. Borrowed by the Hewan tab, which is a route in
 * `features/pets` but a TAB of this module.
 */
export { CustomerModuleHeader } from "./components/CustomerModuleHeader";
/** The two tabs whose screens are not built yet — Membership, Riwayat. */
export { CustomerModulePlaceholder } from "./components/CustomerModulePlaceholder";
export { CustomerCreateForm } from "./components/CustomerCreateForm";
export { CustomerEditForm } from "./components/CustomerEditForm";
/**
 * The two the POS reaches for. Exported from the feature's public surface so the
 * till imports from here rather than reaching into `components/`.
 */
export { CustomerSearchDialog } from "./components/CustomerSearchDialog";
export { CustomerQuickAddDialog } from "./components/CustomerQuickAddDialog";
