/**
 * Public surface of the accounting feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Keuangan dropdown: the hub, the chart of accounts, and the general
 * ledger with its per-entry detail.
 *
 * ChartOfAccountsScreen reads the API: GET /chart-of-accounts/tree, behind
 * `useChartOfAccounts`. The ledger screens and the dashboard still read the
 * fixtures in ./data/dummy and move behind a hook of their own when
 * /api/journal-entries is wired up — the components take plain data and none of
 * them knows where it came from.
 *
 * FinanceDashboardScreen replaced AccountingHub: same landing route, but it
 * leads with the period's figures instead of two links the sidebar already has.
 * Its arithmetic lives in ./financeSummary, exported here because the P&L, arus
 * kas and daftar transaksi screens will fold the same ledger.
 */
export { FinanceDashboardScreen } from "./components/FinanceDashboardScreen";
export {
  cashPosition,
  currentMonthRange,
  financeTransactions,
  formatPercent,
  lineFigures,
  lineLabel,
  marginPct,
  monthRange,
  previousMonthRange,
  CASH_ACCOUNT_CODES,
  SHARED_LINE_LABEL,
  type FinanceQuery,
  type FinanceTransaction,
  type LineFigures,
  type Period,
} from "./financeSummary";
export {
  useFinanceDashboard,
  RECENT_LIMIT,
  type UseFinanceDashboardResult,
} from "./hooks/useFinanceDashboard";
export {
  ChartOfAccountCreateForm,
  ChartOfAccountEditForm,
} from "./components/ChartOfAccountForm";
export { ChartOfAccountsScreen } from "./components/ChartOfAccountsScreen";
export { JournalEntriesScreen } from "./components/JournalEntriesScreen";
export { JournalEntryDetail } from "./components/JournalEntryDetail";
export { ACCOUNTING_CRUMBS } from "./crumbs";
export {
  useChartOfAccounts,
  type UseChartOfAccountsResult,
} from "./hooks/useChartOfAccounts";
