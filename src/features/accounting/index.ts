/**
 * Public surface of the accounting feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Keuangan dropdown: the hub, the chart of accounts, and the general
 * ledger with its per-entry detail.
 *
 * Every screen still reads the fixtures in ./data/dummy. When the module is
 * wired to /api/chart-of-accounts and /api/journal-entries, that import moves
 * behind a hook — the components take plain data and none of them knows where it
 * came from.
 */
export { AccountingHub } from "./components/AccountingHub";
export { ChartOfAccountsScreen } from "./components/ChartOfAccountsScreen";
export { JournalEntriesScreen } from "./components/JournalEntriesScreen";
export { JournalEntryDetail } from "./components/JournalEntryDetail";
export { ACCOUNTING_CRUMBS } from "./crumbs";
