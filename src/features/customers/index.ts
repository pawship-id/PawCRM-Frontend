/**
 * Public surface of the customers feature (Master Data → Customer).
 *
 * Pages import from here, never from deep component paths. The three screen
 * entry points map onto the three routes: list, create, edit.
 */
export { CustomersScreen } from "./components/CustomersScreen";
export { CustomerCreateForm } from "./components/CustomerCreateForm";
export { CustomerEditForm } from "./components/CustomerEditForm";
