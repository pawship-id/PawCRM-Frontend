/**
 * Public surface of the categories feature (Inventory → Kategori).
 *
 * Pages import from here, never from deep component paths. Two entry points for
 * three routes: the list, and one form that both `/new` and `/:id` render — the
 * fields are identical, so `categoryId` is the only thing that tells the two
 * verbs apart. See CategoryForm for why this stopped being a dialog.
 */
export { CategoriesScreen } from "./components/CategoriesScreen";
export { CategoryForm } from "./components/CategoryForm";
