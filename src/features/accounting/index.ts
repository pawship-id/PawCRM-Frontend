/**
 * Public surface of the accounting feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Keuangan dropdown: the hub, the chart of accounts, and the general
 * ledger with its per-entry detail.
 *
 * ChartOfAccountsScreen reads the API: GET /chart-of-accounts/tree, behind
 * `useChartOfAccounts`. The ledger screens and the hub still read the fixtures
 * in ./data/dummy and move behind a hook of their own when /api/journal-entries
 * is wired up — the components take plain data and none of them knows where it
 * came from.
 */
export { AccountingHub } from "./components/AccountingHub";
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
