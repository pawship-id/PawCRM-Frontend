import type { DatePreset } from "@/components";
import type { ChartOfAccount, JournalEntry } from "@/types/accounting";
import type { AccountBalance, JournalSummary } from "@/services/journalEntry.service";
import { toDecimalString, toMinor } from "@/utils/decimal";

/**
 * What the Keuangan dashboard still computes in the browser, and nothing more.
 *
 * THIS FILE USED TO FOLD THE WHOLE LEDGER. Revenue, expense, net profit, the
 * per-line split and the cash position were all sums over `JournalEntry[]`,
 * because the API offered no way to ask for them. It does now —
 * `GET /journal-entries/summary` and `/balances` — so all of that is gone, and
 * what is left is the one thing the server has no opinion about: how a ledger
 * entry reads as a row in a "transaksi terakhir" table.
 *
 * WHY THE PROJECTION STAYED CLIENT-SIDE. It is a reshape of ten records, not
 * arithmetic over thousands, and it encodes a presentation decision — that a POS
 * sale is ONE row showing the revenue rather than two showing revenue and its
 * cost. An endpoint that made that choice would be making it for every future
 * client.
 *
 * MONEY IS A DECIMAL STRING throughout, parsed with utils/decimal in BigInt
 * minor units. Nothing here touches a float.
 */

/**
 * Kas and Bank — the two account codes the cash card sums.
 *
 * Codes, not ids: these are the seeded accounts every tenant gets, and a code
 * survives the account being renamed. The backend knows the same two.
 */
export const CASH_ACCOUNT_CODES = ["1101", "1102"];

/** The bucket a P&L line with no business line falls into. */
export const SHARED_LINE_LABEL = "Bersama (HQ)";

/**
 * The filter value that means "only the lines with no business line on them".
 *
 * `""` already means "not filtering", so the shared bucket needs a token of its
 * own — and it cannot be a real id, because there is no document behind it. The
 * screens translate it before a query leaves for the API; nothing below that
 * layer ever sees it.
 *
 * It lives here rather than on the toolbar that first needed it because the
 * report screens fold against it too, and a constant a summary module imports
 * from a component is a dependency pointing the wrong way.
 */
export const SHARED_LINE_NONE = "__none__";

/**
 * What the toolbar edits, and what goes to the API verbatim.
 *
 * `dateFrom` / `dateTo` are CALENDAR DATES — the server expands them to whole
 * days in the tenant's own timezone, so a client must send the date the user
 * picked and never a UTC-converted timestamp.
 *
 * `businessLineId` IS SINGULAR, where the mockup had a multi-select. The API
 * filters on one line at a time, and the alternative — one summary request per
 * selected line, added up here — would put the arithmetic back in the browser
 * that the endpoint exists to take out. The unfiltered call already returns the
 * per-line split, so "compare the lines" is answered without a filter at all.
 */
export interface FinanceQuery {
  dateFrom: string;
  dateTo: string;
  /** `""` = every branch. */
  branchId: string;
  /** `""` = every line, which is when `byBusinessLine` is worth reading. */
  businessLineId: string;
}

/** One row of the dashboard's transaction table — a ledger entry, folded. */
export interface FinanceTransaction {
  entry: JournalEntry;
  /** Which side of the P&L this entry moved. */
  type: "income" | "expense";
  /**
   * True when it moved that side DOWNWARDS — a return, a reversal, a credited
   * cost.
   *
   * Kept apart from `type` rather than folded into a signed amount, because the
   * two answer different questions: `type` says which half of the P&L moved,
   * this says which way. A row carrying only a negative number would render a
   * refund as "Pemasukan −Rp 180.000", which reads as a mistake.
   */
  reversal: boolean;
  /** Always positive: the direction lives in `type` and `reversal`. */
  amount: string;
  /** The income or expense accounts the amount landed on. */
  accounts: ChartOfAccount[];
  /** Business line ids touched; `null` for an unattributed one. */
  businessLineIds: Array<string | null>;
}

/* ------------------------------------------------------------------ helpers */

function minor(value: string | null | undefined): bigint {
  return toMinor(value ?? "") ?? 0n;
}

/** A business line's name, or the shared bucket's label when it has none. */
export function lineLabel(
  businessLineId: string | null,
  names: Map<string, string>,
): string {
  if (!businessLineId) return SHARED_LINE_LABEL;
  // The id itself when the name could not be loaded — a user may hold
  // `journalEntries:read` without `businessLines:read`, and an id is a worse
  // label than a name but a better one than nothing.
  return names.get(businessLineId) ?? businessLineId;
}

/**
 * `part ÷ whole` as a percentage, to one decimal, or null when the base is zero.
 *
 * ×1000 then ÷10 in BigInt keeps the one decimal without dividing money by
 * money in floating point — the only rounding is the one the display needs.
 */
export function marginPct(part: string, whole: string): number | null {
  const base = minor(whole);
  if (base === 0n) return null;
  return Number((minor(part) * 1000n) / base) / 10;
}

/** "17,2%" — the one place a derived number is rendered rather than returned. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

/* ------------------------------------------------------------------- cash */

/**
 * The cash and bank position — the sum of the balances the API returned.
 *
 * Summed here rather than asked for, because `/balances` answers per account and
 * the card wants one number; adding two decimal strings in BigInt is exact and
 * the alternative would be an endpoint that returns a total nobody can check.
 */
export function cashPosition(accounts: AccountBalance[]): string {
  return toDecimalString(
    accounts.reduce((total, account) => total + minor(account.balance), 0n),
  );
}

/* ------------------------------------------------------------- P&L reading */

export interface LineFigures {
  businessLineId: string | null;
  label: string;
  revenue: string;
  expense: string;
  net: string;
  /** Net ÷ revenue as a percentage. Null when the line booked no revenue. */
  netMarginPct: number | null;
}

/**
 * The summary's per-line rows, labelled and with their margins worked out.
 *
 * The arithmetic that is left — a percentage — is display arithmetic, and doing
 * it here rather than on the server is what keeps `/summary` a statement of
 * fact rather than of presentation.
 */
export function lineFigures(
  summary: JournalSummary,
  names: Map<string, string>,
): LineFigures[] {
  return summary.byBusinessLine.map((row) => ({
    businessLineId: row.businessLineId,
    label: lineLabel(row.businessLineId, names),
    revenue: row.revenue,
    expense: row.expense,
    net: row.net,
    netMarginPct: marginPct(row.net, row.revenue),
  }));
}

/* ------------------------------------------------------------ transactions */

/**
 * Ledger entries as transaction rows — the entries that moved the P&L, folded to
 * one row each.
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
 * AN ENTRY WHOSE ACCOUNTS ARE NOT IN `accountsById` IS DROPPED, not guessed at.
 * That happens when the chart of accounts failed to load, and a row that cannot
 * say whether it was income or expense is worse than an absent one.
 */
export function financeTransactions(
  entries: JournalEntry[],
  accountsById: Map<string, ChartOfAccount>,
): FinanceTransaction[] {
  const rows: FinanceTransaction[] = [];

  for (const entry of entries) {
    let revenue = 0n;
    let expense = 0n;
    const incomeAccounts: ChartOfAccount[] = [];
    const expenseAccounts: ChartOfAccount[] = [];
    const incomeLines = new Set<string | null>();
    const expenseLines = new Set<string | null>();

    for (const line of entry.lines) {
      const account = accountsById.get(line.accountId);
      if (!account) continue;

      const debit = minor(line.debit);
      const credit = minor(line.credit);

      if (account.accountType === "income") {
        revenue += credit - debit;
        if (!incomeAccounts.some((item) => item._id === account._id)) {
          incomeAccounts.push(account);
        }
        incomeLines.add(line.businessLineId);
      } else if (account.accountType === "expense") {
        expense += debit - credit;
        if (!expenseAccounts.some((item) => item._id === account._id)) {
          expenseAccounts.push(account);
        }
        expenseLines.add(line.businessLineId);
      }
    }

    // Revenue decides the row when the entry has both sides: a sale with its
    // HPP is a sale. An entry that moved neither is not a row here at all.
    const income = revenue !== 0n;
    const amount = income ? revenue : expense;
    if (amount === 0n) continue;

    rows.push({
      entry,
      type: income ? "income" : "expense",
      reversal: amount < 0n,
      amount: toDecimalString(amount < 0n ? -amount : amount),
      accounts: income ? incomeAccounts : expenseAccounts,
      businessLineIds: [...(income ? incomeLines : expenseLines)],
    });
  }

  return rows;
}

/* --------------------------------------------------------------- periods */

export interface Period {
  dateFrom: string;
  dateTo: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The whole of `year`-`month` (1-based), as calendar dates. */
export function monthRange(year: number, month: number): Period {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * The month `now` falls in — what the dashboard opens on.
 *
 * TAKES `now` RATHER THAN READING THE CLOCK, and every caller is expected to
 * pass one it got from the server. A client component that read `Date.now()`
 * while rendering would disagree with the HTML the server sent, which React 19
 * reports as a hydration mismatch — and near a month boundary the two would
 * genuinely differ.
 */
export function currentMonthRange(now: Date): Period {
  return monthRange(now.getFullYear(), now.getMonth() + 1);
}

/** The previous month — the dashboard's other preset. */
export function previousMonthRange(now: Date): Period {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return monthRange(year, month);
}

/**
 * A `Date` as the calendar date it is *here*.
 *
 * Local parts rather than `toISOString()`: the latter is UTC and shifts the day
 * back for everyone east of Greenwich, which is everyone using this — "Hari ini"
 * would mean yesterday for the first seven hours of a Jakarta morning.
 */
export function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The period chips every Keuangan report offers.
 *
 * THE FOUR THE SHARED CONTROL HAS EVERYWHERE ELSE, then the two months a report
 * is actually read by — same order, so somebody who learned the picker on
 * Penerimaan Barang finds the same chips in the same places here. Shared across
 * the three report screens rather than rebuilt per screen: chips that drifted
 * apart between two pages read as two different controls.
 *
 * TAKES `now` RATHER THAN READING THE CLOCK, for the reason `currentMonthRange`
 * above spells out — every caller passes one it got from the server.
 */
export function reportPresets(now: Date): DatePreset[] {
  const today = isoDate(now);
  const back = (days: number) => {
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    return isoDate(start);
  };
  const month = (period: Period) => ({
    from: period.dateFrom,
    to: period.dateTo,
  });

  return [
    { label: "Hari ini", from: today, to: today },
    { label: "7 hari", from: back(7), to: today },
    { label: "30 hari", from: back(30), to: today },
    { label: "Bulan ini", ...month(currentMonthRange(now)) },
    { label: "Bulan lalu", ...month(previousMonthRange(now)) },
  ];
}
