/**
 * Public surface of the accounting feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Keuangan dropdown: the hub, the chart of accounts, and the general
 * ledger with its per-entry detail.
 *
 * EVERY SCREEN HERE NOW READS THE API, one hook each: `useChartOfAccounts` over
 * GET /chart-of-accounts/tree, `useFinanceDashboard` over the ledger's three
 * shapes, `useJournalEntries` over GET /journal-entries, and `useJournalEntry`
 * over GET /journal-entries/:id. The fixtures in ./data/dummy are gone with the
 * last of them; the components take plain data and none of them knows where it
 * came from.
 *
 * FinanceDashboardScreen replaced AccountingHub: same landing route, but it
 * leads with the period's figures instead of two links the sidebar already has.
 * Its arithmetic lives in ./financeSummary, exported here because the P&L and
 * arus kas screens fold the same ledger.
 *
 * IT SPANS FOUR MODULES NOW, not one. The Ringkasan tab reads the ledger, the
 * cash transactions, the customer invoices and the purchase invoices — see
 * ./hooks/useFinanceDashboard for which figure comes from where. Nothing about
 * that surfaces here: the screen is still one import and one prop.
 */
/**
 * The module's shared chrome — the title and the four-tab row its screens wear.
 */
export { AccountingModuleHeader } from "./components/AccountingModuleHeader";
export { FinanceDashboardScreen } from "./components/FinanceDashboardScreen";
/**
 * The context bar every Keuangan screen wears — Cabang, Lini Usaha, Periode.
 * Exported because Kas & Bank borrows it too, and four screens each rolling
 * their own would be the fifteen-toolbars mistake with a different noun.
 */
export { FinanceReportToolbar } from "./components/FinanceReportToolbar";
/**
 * The two report screens, rendering FIXTURES rather than the ledger — see
 * ./data/reportFixtures.ts. They are here so the routes can reach them and the
 * layout can be reviewed; the swap to a real endpoint is a change of source
 * inside each screen, not of anything a page imports.
 */
export { ProfitLossScreen } from "./components/ProfitLossScreen";
export { CashflowScreen } from "./components/CashflowScreen";
export {
  cashflowReport,
  profitLossMatrix,
  type CashflowReport,
  type ProfitLossMatrix,
  type ReportQuery,
} from "./reportSummary";
export { BusinessLinesScreen } from "./components/BusinessLinesScreen";
export { useBusinessLines } from "./hooks/useBusinessLines";
export {
  balanceOf,
  cashPosition,
  currentMonthRange,
  formatPercent,
  isoDate,
  lineFigures,
  lineLabel,
  marginPct,
  monthRange,
  previousMonthRange,
  reportPresets,
  trendWindow,
  CASH_ACCOUNT_CODES,
  COMMISSION_PAYABLE_CODE,
  TREND_DAYS,
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
  type FinanceQuery,
  type LineFigures,
  type Period,
} from "./financeSummary";
export {
  useFinanceDashboard,
  type FinanceDashboardGrants,
  type UseFinanceDashboardResult,
} from "./hooks/useFinanceDashboard";
export {
  ChartOfAccountCreateForm,
  ChartOfAccountEditForm,
} from "./components/ChartOfAccountForm";
export { ChartOfAccountsScreen } from "./components/ChartOfAccountsScreen";
export { JournalEntriesScreen } from "./components/JournalEntriesScreen";
export { JournalEntryDetail } from "./components/JournalEntryDetail";
/**
 * The manual-entry form — the only kind of posting a human writes. Everything
 * else reaches the ledger service-to-service from the module that owns the
 * document, so this is the one screen that can create a journal entry at all.
 */
export { JournalEntryCreateForm } from "./components/JournalEntryCreateForm";
export { ACCOUNTING_CRUMBS } from "./crumbs";
export {
  useChartOfAccounts,
  type UseChartOfAccountsResult,
} from "./hooks/useChartOfAccounts";
export {
  useJournalEntries,
  DEFAULT_JOURNAL_QUERY,
  type JournalEntriesQuery,
  type UseJournalEntriesResult,
} from "./hooks/useJournalEntries";
