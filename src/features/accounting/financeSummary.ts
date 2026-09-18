import type { DatePreset } from "@/components";
import type { AccountBalance, JournalSummary } from "@/services/journalEntry.service";
import { toDecimalString, toMinor } from "@/utils/decimal";

/**
 * What the Keuangan dashboard still computes in the browser, and nothing more.
 *
 * THIS FILE USED TO FOLD THE WHOLE LEDGER. Revenue, expense, net profit, the
 * per-line split and the cash position were all sums over `JournalEntry[]`,
 * because the API offered no way to ask for them. It does now —
 * `GET /journal-entries/summary`, `/trend` and `/balances` — so all of that is
 * gone, and what is left is arithmetic no server should be asked for: a
 * percentage, a label, and the calendar dates a picker offers.
 *
 * THE ENTRY→ROW PROJECTION WENT WITH THE TABLE IT FED. Ringkasan no longer
 * carries a "transaksi terakhir" list — that is the Transaksi tab, over
 * `/cash-transactions` — so `financeTransactions` had no caller left. It is in
 * the history if a screen ever wants the ledger folded that way again.
 *
 * MONEY IS A DECIMAL STRING throughout, parsed with utils/decimal in BigInt
 * minor units. Nothing here touches a float.
 */

/**
 * Kas and Bank — the CATEGORY the cash card sums.
 *
 * IT WAS TWO HARDCODED CODES until 18 September 2026 (`["1101", "1102"]`), and
 * that was wrong in a way nobody could see from the card: a tenant that added
 * "1105 Bank Mandiri" — an ordinary thing to do the day you open a second
 * account — had its money silently left out of the figure the shop reads first.
 *
 * A category is the honest question. The chart of accounts knows which accounts
 * are cash because somebody said so when they created them, and that answer
 * follows the tenant's own chart instead of a pair of numbers in this file.
 */
export const CASH_ACCOUNT_CATEGORY = "cash_bank" as const;

/**
 * Utang Komisi — the account "Komisi Belum Dibayar" reads.
 *
 * THE LEDGER'S ANSWER, NOT PAYROLL'S. The commission recap
 * (`/reports/commissions`) says what a month EARNED; this balance is what has
 * been accrued and not yet paid out, across every month still open. They are
 * different questions, and the card asks this one — a shop owner wanting to know
 * what is owed does not want it reset on the first of the month.
 *
 * A code rather than an id, for the reason the cash codes give: it is seeded for
 * every tenant and survives the account being renamed. `commission.service.js`
 * resolves the same "2102".
 */
export const COMMISSION_PAYABLE_CODE = "2102";

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

/**
 * One account's balance out of a trial balance, by code — `"0"` when it has none.
 *
 * ABSENT AND ZERO ARE THE SAME ANSWER HERE, deliberately, and this is the one
 * place that is true: `/balances` omits an account with no postings at all, and
 * "nobody has ever been owed commission" and "everybody has been paid" are both
 * honestly rendered as Rp 0 on the card. It would NOT be true of a figure whose
 * absence meant a failed request — that is what the hook's `error` is for.
 */
export function balanceOf(accounts: AccountBalance[], code: string): string {
  const account = accounts.find((item) => item.code === code);
  return account ? account.balance : "0";
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
 * Monday to Sunday of the week `now` falls in — "Minggu ini".
 *
 * THE INDONESIAN WORKING WEEK, and the same one the SERVER means: `rangeOf`
 * in PawCRM-Backend/src/utils/period.js cuts a named "week" Monday-to-Sunday
 * too. A client that started its week on Sunday would ask for a range the
 * backend would happily answer and nobody could reconcile with a report.
 *
 * A WHOLE WEEK, NOT "SO FAR" — it ends on Sunday even on a Wednesday, again
 * matching the server. An entry dated for Friday is in this week, and cutting
 * at today would hide it until Friday arrived.
 */
export function weekRange(now: Date): Period {
  const monday = new Date(now);
  // getDay() is 0 on Sunday, so Sunday is six days after ITS Monday, not before
  // the next one.
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return { dateFrom: isoDate(monday), dateTo: isoDate(sunday) };
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

/** How many days the Ringkasan tab's trend chart draws. */
export const TREND_DAYS = 7;

/**
 * The last `days` calendar days ending today — the trend chart's window.
 *
 * IT DOES NOT FOLLOW THE PERIOD FILTER, and the card says so. A chart is a shape
 * over time, and a shape needs a fixed number of points to be a shape: "Bulan
 * lalu" would draw thirty, "Hari ini" one, and "Semua" as many as the tenant has
 * history — three different pictures under one heading, only one of which is
 * readable. Branch and business line DO narrow it, because those change whose
 * money is being drawn rather than how many points there are.
 *
 * Inclusive of today, so `TREND_DAYS` of 7 is today and the six days before it —
 * the same arithmetic `reportPresets`' "7 hari" chip does, and deliberately the
 * same answer.
 *
 * TAKES `now` RATHER THAN READING THE CLOCK, for the reason `currentMonthRange`
 * spells out: a client component that read `Date.now()` while rendering would
 * disagree with the HTML the server sent.
 */
export function trendWindow(now: Date, days: number = TREND_DAYS): Period {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));

  return { dateFrom: isoDate(start), dateTo: isoDate(now) };
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
    { label: "Minggu ini", ...month(weekRange(now)) },
    { label: "7 hari", from: back(7), to: today },
    { label: "30 hari", from: back(30), to: today },
    { label: "Bulan ini", ...month(currentMonthRange(now)) },
    { label: "Bulan lalu", ...month(previousMonthRange(now)) },
  ];
}
