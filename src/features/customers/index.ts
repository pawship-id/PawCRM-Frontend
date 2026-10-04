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
/**
 * The module's front page — the Ringkasan tab's worklists. Wears
 * `CustomerModuleHeader` like every other tab.
 */
export { CustomerSummaryScreen } from "./components/CustomerSummaryScreen";
/**
 * The read side of one customer — the mockup's `profilPelanggan`, at
 * `/master/customers/:id`. The form it links to is `CustomerEditForm`, one route
 * deeper; the two used to be the same screen. See CustomerProfileScreen.
 */
export { CustomerProfileScreen } from "./components/CustomerProfileScreen";
export { CustomerCreateForm } from "./components/CustomerCreateForm";
export { CustomerEditForm } from "./components/CustomerEditForm";
/**
 * The two the POS reaches for. Exported from the feature's public surface so the
 * till imports from here rather than reaching into `components/`.
 */
export { CustomerSearchDialog } from "./components/CustomerSearchDialog";
export { CustomerQuickAddDialog } from "./components/CustomerQuickAddDialog";
/**
 * The dedicated "Lihat semua pelanggan tidak aktif" list, reached only from
 * the Ringkasan tab's panel — not one of the module's tabs. See its own file.
 */
export { DormantCustomersScreen } from "./components/DormantCustomersScreen";
/** The server page's URL parser for `?createdSince=` — see its own file. */
export { customersQueryFromParams } from "./query";
export type { CustomersQuery } from "./hooks/useCustomers";
