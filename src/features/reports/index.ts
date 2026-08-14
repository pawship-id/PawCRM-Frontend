/**
 * Public surface of the reports feature.
 *
 * Pages import from here, never from deep component paths. Three screens and a
 * hub — the other four reports on that hub link into the modules that own their
 * data (inventory's stock card, batch list and opname history), because a
 * "report" copy of a screen that already exists is the fastest way to end up
 * with two that slowly stop agreeing.
 */
export { ReportsHub } from "./components/ReportsHub";
export { StockOnHandScreen } from "./components/StockOnHandScreen";
export { LowStockScreen } from "./components/LowStockScreen";
export { ConsignmentScreen } from "./components/ConsignmentScreen";
