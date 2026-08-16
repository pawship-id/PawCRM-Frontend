import type { ChartOfAccount, JournalEntry } from "@/types/accounting";
import { toDecimalString, toMinor } from "@/utils/decimal";

/**
 * The Keuangan dashboard's arithmetic — everything it shows, derived from the
 * ledger and nothing else.
 *
 * WHY DERIVED RATHER THAN STORED. A revenue figure, a margin and a cash position
 * are the three numbers somebody quotes in a meeting, and the fastest way to get
 * them wrong is to keep a second copy. Every value here is a fold over
 * `JournalEntry[]`, so the dashboard cannot disagree with the Jurnal Umum screen
 * reading the same list — and when those entries come from
 * `GET /api/journal-entries` instead of the fixtures, this file does not change.
 *
 * SIGN CONVENTION, once, here: income accounts grow on the credit side and
 * expense accounts on the debit side (`normalBalanceOf`), so revenue is
 * Σ(credit − debit) and expense is Σ(debit − credit). Both come out positive for
 * an ordinary month, and a return or a reversal makes its line negative on its
 * own — which is exactly what should happen, and why reversal pairs need no
 * special case: the entry and the one that undid it are both in the list and
 * they cancel.
 *
 * ARITHMETIC IS BIGINT MINOR UNITS throughout, per utils/decimal. Percentages
 * are the one place a Number appears, because a margin is a display value and
 * never feeds another calculation.
 */

/**
 * Kas and Bank — the two accounts "Saldo Kas & Bank" sums.
 *
 * Codes, not ids: these are the seeded accounts every tenant gets
 * (`isDefault` in the COA), and a code survives the account being renamed.
 */
export const CASH_ACCOUNT_CODES = ["1101", "1102"];

/**
 * The bucket for a P&L line carrying no `businessLine` — rent, office payroll,
 * the electricity bill. Empty string is the repo's "unset" convention, and it is
 * literally true here: the line has no business line, rather than belonging to
 * one called "Bersama".
 */
export const SHARED_LINE = "";

export const SHARED_LINE_LABEL = "Bersama (HQ)";

/** What the toolbar edits. `""` and `[]` both mean "not filtering". */
export interface FinanceQuery {
  /** ISO `yyyy-mm-dd`, or `""` when unbounded. */
  from: string;
  to: string;
  /** Matches `JournalEntry.branchName` exactly. */
  branchName: string;
  /** Normalised line names; `SHARED_LINE` for the unattributed bucket. */
  businessLines: string[];
}

export interface LineFigures {
  /** The normalised business line — `SHARED_LINE` for the shared bucket. */
  line: string;
  label: string;
  revenue: string;
  expense: string;
  net: string;
  /** Net ÷ revenue as a percentage. Null when the line booked no revenue. */
  netMarginPct: number | null;
}

export interface FinanceSummary {
  revenue: string;
  expense: string;
  netProfit: string;
  netMarginPct: number | null;
  /**
   * Σ(debit − credit) on kas & bank for every entry dated on or before
   * `query.to` — a BALANCE, so it deliberately ignores `query.from`. A cash
   * position is "as of a date", not "during a range", and a card that summed
   * only the range would answer a question nobody asked.
   */
  cashBalance: string;
  /** Kas & bank movements inside the range — the two halves of the balance. */
  cashIn: string;
  cashOut: string;
  /** One row per line that had any activity, revenue-first. */
  perLine: LineFigures[];
  /** How many entries the period and branch filter left. */
  entryCount: number;
}

/** One row of the dashboard's transaction table — a ledger entry, folded. */
export interface FinanceTransaction {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  branchName: string;
  /** Which side of the P&L this entry moved. */
  type: "income" | "expense";
  /**
   * True when the entry moved that side DOWNWARDS — a sales return, a reversal,
   * a credited cost.
   *
   * Kept apart from `type` rather than folded into a signed amount, because the
   * two answer different questions: `type` says which half of the P&L moved,
   * this says which way. A row that only carried a negative number would render
   * a refund as "Pemasukan −Rp 180.000", which reads as a mistake.
   */
  reversal: boolean;
  /** Always positive: the direction lives in `type` and `reversal`. */
  amount: string;
  /** The income or expense accounts the amount landed on. */
  accounts: ChartOfAccount[];
  /** Normalised lines touched; `SHARED_LINE` for an unattributed one. */
  lines: string[];
  /** Kas & bank moved. Empty for an accrual — a faktur or a komisi accrual. */
  cashAccounts: ChartOfAccount[];
}

/* ------------------------------------------------------------------ helpers */

function minor(value: string): bigint {
  return toMinor(value) ?? 0n;
}

/** `businessLine` as the filter and the buckets see it: null collapses to "". */
function normaliseLine(businessLine: string | null): string {
  return businessLine ?? SHARED_LINE;
}

/**
 * Percent, to one decimal, or null when the base is zero.
 *
 * ×1000 then ÷10 keeps the one decimal without a float division on money —
 * the only rounding here is the one the display needs.
 */
function percentOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number((part * 1000n) / whole) / 10;
}

/** Both bounds inclusive; ISO dates compare correctly as strings. */
function inPeriod(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesBranch(entry: JournalEntry, branchName: string): boolean {
  return !branchName || entry.branchName === branchName;
}

function matchesLine(lines: string[], businessLine: string | null): boolean {
  return !lines.length || lines.includes(normaliseLine(businessLine));
}

/* -------------------------------------------------------------- vocabulary */

/**
 * The branches present in the ledger, alphabetical.
 *
 * Read off the entries rather than from `GET /api/branches`, so the filter can
 * never offer a branch that has nothing to show — and so this screen keeps
 * working against a tenant whose branch list the user cannot read.
 */
export function branchesIn(entries: JournalEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.branchName))].sort((a, b) =>
    a.localeCompare(b, "id"),
  );
}

/**
 * The business lines the ledger actually tags, alphabetical, with the shared
 * bucket last when anything landed in it.
 *
 * Derived for the same reason as the branches, and one more: a business line is
 * a free label the tenant manages (services/businessLine.service.ts), not an
 * enum this screen may hardcode.
 */
export function businessLinesIn(entries: JournalEntry[]): string[] {
  const named = new Set<string>();
  let shared = false;

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.businessLine) named.add(line.businessLine);
      else shared = true;
    }
  }

  const sorted = [...named].sort((a, b) => a.localeCompare(b, "id"));
  return shared ? [...sorted, SHARED_LINE] : sorted;
}

export function lineLabel(line: string): string {
  return line === SHARED_LINE ? SHARED_LINE_LABEL : line;
}

/* ----------------------------------------------------------------- summary */

export function summarise(
  entries: JournalEntry[],
  accountsById: Map<string, ChartOfAccount>,
  query: FinanceQuery,
): FinanceSummary {
  let revenue = 0n;
  let expense = 0n;
  let cashBalance = 0n;
  let cashIn = 0n;
  let cashOut = 0n;
  let entryCount = 0;

  const perLine = new Map<string, { revenue: bigint; expense: bigint }>();

  for (const entry of entries) {
    if (!matchesBranch(entry, query.branchName)) continue;

    const withinPeriod = inPeriod(entry.date, query.from, query.to);
    // A balance is cumulative: everything up to the end of the range counts,
    // whatever the start of it says.
    const uptoPeriodEnd = !query.to || entry.date <= query.to;

    if (withinPeriod) entryCount += 1;

    for (const line of entry.lines) {
      const account = accountsById.get(line.accountId);
      if (!account) continue;

      const debit = minor(line.debit);
      const credit = minor(line.credit);

      if (
        account.accountType === "asset" &&
        CASH_ACCOUNT_CODES.includes(account.code)
      ) {
        if (uptoPeriodEnd) cashBalance += debit - credit;
        if (withinPeriod) {
          cashIn += debit;
          cashOut += credit;
        }
        continue;
      }

      if (!withinPeriod) continue;
      if (!matchesLine(query.businessLines, line.businessLine)) continue;

      const key = normaliseLine(line.businessLine);
      const bucket = perLine.get(key) ?? { revenue: 0n, expense: 0n };

      if (account.accountType === "income") {
        const effect = credit - debit;
        revenue += effect;
        bucket.revenue += effect;
        perLine.set(key, bucket);
      } else if (account.accountType === "expense") {
        const effect = debit - credit;
        expense += effect;
        bucket.expense += effect;
        perLine.set(key, bucket);
      }
    }
  }

  const netProfit = revenue - expense;

  const lines: LineFigures[] = [...perLine.entries()]
    .map(([line, figures]) => ({
      line,
      label: lineLabel(line),
      revenue: toDecimalString(figures.revenue),
      expense: toDecimalString(figures.expense),
      net: toDecimalString(figures.revenue - figures.expense),
      netMarginPct: percentOf(figures.revenue - figures.expense, figures.revenue),
    }))
    // Revenue-first, so the lines that earn lead and the shared bucket — which
    // never has any — falls to the end without being special-cased.
    .sort((a, b) => Number(minor(b.revenue) - minor(a.revenue)));

  return {
    revenue: toDecimalString(revenue),
    expense: toDecimalString(expense),
    netProfit: toDecimalString(netProfit),
    netMarginPct: percentOf(netProfit, revenue),
    cashBalance: toDecimalString(cashBalance),
    cashIn: toDecimalString(cashIn),
    cashOut: toDecimalString(cashOut),
    perLine: lines,
    entryCount,
  };
}

/* ------------------------------------------------------------ transactions */

/**
 * The entries that moved the P&L, newest first, folded to one row each.
 *
 * ONLY P&L ENTRIES. A goods receipt and a supplier payment are real
 * transactions, but neither is income or expense — booking stock is an asset
 * swap and paying a bill settles a liability — so a row for them would need an
 * empty "Tipe" column. This table sits under the revenue, expense and profit
 * cards and answers "what made those numbers"; the complete list, balance-sheet
 * movements included, is the Jurnal Umum screen the header links to.
 *
 * ONE ROW PER ENTRY, not per line. A POS recap credits revenue and debits HPP in
 * the same entry; splitting it in two would show a sale and a cost that look
 * like separate events. The row carries the revenue side, because that is the
 * transaction — the HPP is its consequence.
 *
 * `limit` is applied AFTER filtering, so the dashboard's ten rows are the ten
 * most recent inside the period rather than the ten most recent overall.
 */
export function financeTransactions(
  entries: JournalEntry[],
  accountsById: Map<string, ChartOfAccount>,
  query: FinanceQuery,
  limit?: number,
): FinanceTransaction[] {
  const rows: FinanceTransaction[] = [];

  for (const entry of entries) {
    if (!matchesBranch(entry, query.branchName)) continue;
    if (!inPeriod(entry.date, query.from, query.to)) continue;

    let revenue = 0n;
    let expense = 0n;
    const incomeAccounts: ChartOfAccount[] = [];
    const expenseAccounts: ChartOfAccount[] = [];
    const incomeLines = new Set<string>();
    const expenseLines = new Set<string>();
    const cashAccounts: ChartOfAccount[] = [];

    for (const line of entry.lines) {
      const account = accountsById.get(line.accountId);
      if (!account) continue;

      const debit = minor(line.debit);
      const credit = minor(line.credit);

      if (
        account.accountType === "asset" &&
        CASH_ACCOUNT_CODES.includes(account.code)
      ) {
        if (!cashAccounts.some((item) => item._id === account._id)) {
          cashAccounts.push(account);
        }
        continue;
      }

      if (!matchesLine(query.businessLines, line.businessLine)) continue;

      if (account.accountType === "income") {
        revenue += credit - debit;
        if (!incomeAccounts.some((item) => item._id === account._id)) {
          incomeAccounts.push(account);
        }
        incomeLines.add(normaliseLine(line.businessLine));
      } else if (account.accountType === "expense") {
        expense += debit - credit;
        if (!expenseAccounts.some((item) => item._id === account._id)) {
          expenseAccounts.push(account);
        }
        expenseLines.add(normaliseLine(line.businessLine));
      }
    }

    // Revenue decides the row when the entry has both sides: a sale with its
    // HPP is a sale. An entry that moved neither — or whose only P&L lines the
    // business-line filter excluded — is not a row here at all.
    const income = revenue !== 0n;
    const amount = income ? revenue : expense;
    if (amount === 0n) continue;

    rows.push({
      entryId: entry._id,
      entryNumber: entry.entryNumber,
      date: entry.date,
      description: entry.description,
      branchName: entry.branchName,
      type: income ? "income" : "expense",
      reversal: amount < 0n,
      amount: toDecimalString(amount < 0n ? -amount : amount),
      accounts: income ? incomeAccounts : expenseAccounts,
      lines: [...(income ? incomeLines : expenseLines)],
      cashAccounts,
    });

    if (limit !== undefined && rows.length >= limit) break;
  }

  return rows;
}

/* --------------------------------------------------------------- periods */

export interface Period {
  from: string;
  to: string;
}

/**
 * The months the ledger has entries in, newest first, as `yyyy-mm`.
 *
 * The period controls are built from this rather than from `new Date()`, for
 * two reasons. A dashboard whose default range is "this month" shows an empty
 * month the moment the fixtures fall behind the calendar — and a client
 * component that reads the clock while rendering disagrees with the HTML the
 * server sent, which React 19 reports as a hydration mismatch.
 */
export function ledgerMonths(entries: JournalEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort((a, b) =>
    b.localeCompare(a),
  );
}

/** `"2026-08"` → the whole of August. Leap years included — day 0 of the next. */
export function monthRange(month: string): Period {
  const [year, index] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The month the newest entry sits in — what the dashboard opens on. */
export function defaultPeriod(entries: JournalEntry[]): Period {
  const [latest] = ledgerMonths(entries);
  return latest ? monthRange(latest) : { from: "", to: "" };
}

/** Everything in the ledger, first entry to last — the "Semua periode" preset. */
export function fullPeriod(entries: JournalEntry[]): Period {
  const dates = entries.map((entry) => entry.date).sort();
  return { from: dates.at(0) ?? "", to: dates.at(-1) ?? "" };
}

/** "17,2%" — the one place a derived number is rendered rather than returned. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}
