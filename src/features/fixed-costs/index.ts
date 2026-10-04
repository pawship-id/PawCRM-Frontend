/**
 * Biaya Tetap — the costs a shop knows it will meet again.
 *
 * The panel is handed its state by the page above it, exactly as
 * `CashTransactionsPanel` is: Kas & Bank owns both sub-tabs and neither owns
 * its own fetch.
 */
export { FixedCostsPanel } from "./components/FixedCostsPanel";
export { FixedCostForm } from "./components/FixedCostForm";
export { FixedCostDetail } from "./components/FixedCostDetail";
export { FixedCostEditScreen } from "./components/FixedCostEditScreen";
export { PostOccurrenceDialog } from "./components/PostOccurrenceDialog";
export { useFixedCost } from "./hooks/useFixedCost";
export {
  useFixedCosts,
  FIXED_COST_PAGE_SIZES,
  DEFAULT_FIXED_COSTS_QUERY,
  type FixedCostsQuery,
  type UseFixedCostsResult,
} from "./hooks/useFixedCosts";
export {
  FIXED_COSTS_HREF,
  fixedCostHref,
  KIND_LABEL,
  KIND_BADGE,
  INTERVAL_LABEL,
  categoryLabel,
  dueLabel,
  formatDate,
} from "./labels";
