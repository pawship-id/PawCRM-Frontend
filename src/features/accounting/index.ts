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
 * THE THREE READING REPORTS, all of them live against the ledger since 18
 * September 2026 — Laba Rugi over `GET /journal-entries/profit-loss`, Neraca and
 * Arus Kas over `GET /journal-entries/balances`. The fixtures they used to
 * render are gone, and so is the banner that said the figures were examples.
 *
 * They share `useFinanceReport`, which fetches the branches and the lines once
 * and the figures per filter. Nothing a page imports changed in the swap, which
 * is what the seam was for.
 */
export { ProfitLossScreen } from "./components/ProfitLossScreen";
export { CashflowScreen } from "./components/CashflowScreen";
/**
 * KAS & BANK LIVES HERE NOW (20 September 2026). It moved out of
 * `features/payment-channels` when its table stopped listing channels and
 * started listing the ledger accounts money sits in — which is an accounting
 * screen wherever the file happens to sit. The channels moved the other way, to
 * Pengaturan.
 */
export {
  KasBankScreen,
  type KasBankSection,
} from "./components/KasBankScreen";
export { CashBankAccountsTable } from "./components/CashBankAccountsTable";
export {
  useCashBankAccounts,
  sumColumn,
  type CashBankAccountRow,
  type CashBankAccountsQuery,
} from "./hooks/useCashBankAccounts";
/**
 * NERACA — added 18 September 2026, and the report that could not exist before
 * categories did: `accountType: "asset"` cannot tell cash from stock from a
 * vehicle, and a balance sheet is exactly that distinction.
 */
export { BalanceSheetScreen } from "./components/BalanceSheetScreen";
export { balanceSheet, type BalanceSheet } from "./balanceSheet";
export {
  cashflowReport,
  profitLossMatrix,
  type CashflowReport,
  type ProfitLossMatrix,
  type ReportQuery,
} from "./reportSummary";
export {
  useFinanceReport,
  dayBefore,
  type FinanceReportKind,
} from "./hooks/useFinanceReport";
export { BusinessLinesScreen } from "./components/BusinessLinesScreen";
export { useBusinessLines } from "./hooks/useBusinessLines";
export {
  changePct,
  currentMonthRange,
  formatPercent,
  isoDate,
  largestExpenses,
  lineLabel,
  lineProfits,
  marginPct,
  monthRange,
  previousMonthRange,
  previousPeriod,
  profitLossHeadline,
  reportPresets,
  trendWindow,
  CASH_ACCOUNT_CATEGORY,
  TOP_EXPENSES,
  TREND_DAYS,
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
  type ExpenseShare,
  type FinanceQuery,
  type LineProfit,
  type Period,
  type ProfitLossHeadline,
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
/**
 * The Detil Akun a posting may name. Exported because Transaksi Keuangan asks
 * the same question of the same accounts, and a second copy there is how the two
 * would drift on whether a retired rule is still offered.
 */
export { allocationOptionsFor } from "./allocationLabels";
export { JournalEntriesScreen } from "./components/JournalEntriesScreen";
export { JournalEntryDetail } from "./components/JournalEntryDetail";
/** Also read by Kas & Bank's "Jurnal terkait" dialog, not only by the page. */
export {
  useJournalEntry,
  type UseJournalEntryResult,
} from "./hooks/useJournalEntry";
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
  JOURNAL_PAGE_SIZES,
  type JournalEntriesQuery,
  type UseJournalEntriesResult,
} from "./hooks/useJournalEntries";
