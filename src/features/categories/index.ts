/**
 * Public surface of the categories feature (Inventory → Kategori).
 *
 * Pages import from here, never from deep component paths. One entry point
 * rather than three: a category has a single editable field, so create and
 * rename happen in a dialog on the list screen instead of on routes of their
 * own — see CategoryFormDialog.
 */
export { CategoriesScreen } from "./components/CategoriesScreen";
