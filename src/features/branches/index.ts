/**
 * Public surface of the branches feature (Pengaturan › Cabang).
 *
 * Pages import from here, never from deep component paths. Two screens, two
 * routes: list and edit. There is no create screen since 22 September 2026 — a
 * branch is its own subscription and the Buloo team switches it on.
 */
export { BranchesScreen } from "./components/BranchesScreen";
export { BranchEditForm } from "./components/BranchEditForm";
