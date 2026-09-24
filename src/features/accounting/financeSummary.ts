import type { DatePreset } from "@/components";
import type {
  ProfitLossResult,
  ProfitLossRow,
} from "@/services/journalEntry.service";
import type { AccountCategory } from "@/types/accounting";
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
  /**
   * Laba rugi only: divide the shared costs across the lines using the
   * allocation rules on each account.
   *
   * OFF BY DEFAULT. The undivided report is the one every previous month was
   * read as, so it stays the thing the screen opens on and the toggle is how
   * somebody asks the other question.
   */
  allocation?: boolean;
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

/* ------------------------------------------------------------- P&L reading */

/*
  RINGKASAN READS THE LABA RUGI, NOT `/summary` (22 September 2026). The v3
  mockup asks for HPP and biaya per lini and for the largest expense accounts,
  and `/summary` folds by account CLASS — HPP and biaya are both `expense` there.
  `/profit-loss` is BO's own statement, already split by category and by line,
  so every figure below is read off one response the Laba Rugi screen also
  renders. The two screens cannot disagree about a period because they are the
  same answer.
*/

/** A category's row, or zeros when the response somehow lacks it. */
function categoryRow(
  result: ProfitLossResult,
  category: AccountCategory,
): ProfitLossRow {
  return (
    result.categories.find((row) => row.accountCategory === category) ?? {
      lines: [],
      total: "0",
    }
  );
}

/** One line's cell of a row — `"0"` when the line did not move there. */
function cellOf(row: ProfitLossRow, businessLineId: string | null): string {
  return (
    row.lines.find((cell) => cell.businessLineId === businessLineId)?.amount ??
    "0"
  );
}

export interface ProfitLossHeadline {
  /**
   * Pendapatan at list price — every income account that grew, BEFORE the
   * contra accounts (4191 Diskon, 4192 Retur) take their share.
   *
   * NOT AN ESTIMATE, unlike the mockup's flat 11%. Those two accounts carry a
   * debit balance inside the pendapatan category, so the accounts with a
   * negative total are exactly the deductions, and the ones with a positive
   * total are the gross.
   */
  grossRevenue: string;
  /** Diskon + retur, as a positive figure. */
  deductions: string;
  /** The pendapatan category — what the laba rugi calls revenue. */
  netRevenue: string;
  hpp: string;
  grossProfit: string;
  /** The `biaya` category — operating costs. */
  operatingExpense: string;
  /** Pendapatan lainnya − biaya lainnya. Usually zero, and hidden when it is. */
  otherNet: string;
  netProfit: string;
  /** Net profit ÷ net revenue. Null when nothing was sold. */
  marginPct: number | null;
}

/** The consolidated column of the laba rugi, read as the Ringkasan cards. */
export function profitLossHeadline(result: ProfitLossResult): ProfitLossHeadline {
  let gross = 0n;
  let deductions = 0n;

  for (const account of result.accounts) {
    if (account.accountCategory !== "pendapatan") continue;
    const total = minor(account.total);
    if (total >= 0n) gross += total;
    else deductions -= total;
  }

  const netRevenue = categoryRow(result, "pendapatan").total;
  const netProfit = result.results.netProfit.total;

  return {
    grossRevenue: toDecimalString(gross),
    deductions: toDecimalString(deductions),
    netRevenue,
    hpp: categoryRow(result, "hpp").total,
    grossProfit: result.results.grossProfit.total,
    operatingExpense: categoryRow(result, "biaya").total,
    otherNet: toDecimalString(
      minor(categoryRow(result, "pendapatan_lainnya").total) -
        minor(categoryRow(result, "biaya_lainnya").total),
    ),
    netProfit,
    marginPct: marginPct(netProfit, netRevenue),
  };
}

export interface LineProfit {
  businessLineId: string | null;
  label: string;
  revenue: string;
  hpp: string;
  /**
   * EVERYTHING BETWEEN LABA KOTOR AND LABA BERSIH — biaya, plus biaya lainnya,
   * minus pendapatan lainnya. Derived as `revenue − hpp − net` so the row always
   * reads across: a Biaya column of `biaya` alone would leave a line with other
   * income whose four figures do not add up, and nobody trusts a table that
   * does not add up.
   */
  cost: string;
  net: string;
  /** Net ÷ revenue. Null for a line that sold nothing, the shared bucket above all. */
  marginPct: number | null;
}

/**
 * The laba rugi's columns as rows — "Laba per lini bisnis".
 *
 * THINNEST MARGIN FIRST, as the mockup orders it: the line that needs looking
 * at leads. A line with no revenue has no margin to rank, so it — and the
 * unattributed bucket, which never has any — sorts after every line that does.
 */
export function lineProfits(
  result: ProfitLossResult,
  names: Map<string, string>,
): LineProfit[] {
  const revenue = categoryRow(result, "pendapatan");
  const hpp = categoryRow(result, "hpp");
  const net = result.results.netProfit;

  return net.lines
    .map((cell) => {
      const id = cell.businessLineId;
      const lineRevenue = cellOf(revenue, id);
      const lineHpp = cellOf(hpp, id);
      return {
        businessLineId: id,
        label: lineLabel(id, names),
        revenue: lineRevenue,
        hpp: lineHpp,
        cost: toDecimalString(
          minor(lineRevenue) - minor(lineHpp) - minor(cell.amount),
        ),
        net: cell.amount,
        marginPct: marginPct(cell.amount, lineRevenue),
      };
    })
    .sort((a, b) => {
      if (a.marginPct === null) return b.marginPct === null ? 0 : 1;
      if (b.marginPct === null) return -1;
      return a.marginPct - b.marginPct;
    });
}

export interface ExpenseShare {
  accountId: string;
  code: string;
  name: string;
  amount: string;
  /** Share of every expense account's total, 0–100. */
  sharePct: number;
}

/** How many accounts "Beban terbesar" lists before it stops. */
export const TOP_EXPENSES = 5;

/**
 * The expense accounts that cost the most — "Beban terbesar periode ini".
 *
 * BIAYA AND BIAYA LAINNYA, NOT HPP. HPP is what the goods cost and moves with
 * sales; the question here is where the running costs go, which is what the
 * mockup lists (Gaji, Sewa, Utilitas). An account whose total is zero or
 * negative — a refund that outweighed the spend — is not a cost to rank.
 */
export function largestExpenses(
  result: ProfitLossResult,
  limit: number = TOP_EXPENSES,
): ExpenseShare[] {
  const costs = result.accounts.filter(
    (account) =>
      (account.accountCategory === "biaya" ||
        account.accountCategory === "biaya_lainnya") &&
      minor(account.total) > 0n,
  );
  const whole = costs.reduce((sum, account) => sum + minor(account.total), 0n);

  return costs
    .sort((a, b) => {
      const left = minor(a.total);
      const right = minor(b.total);
      return right > left ? 1 : right < left ? -1 : 0;
    })
    .slice(0, limit)
    .map((account) => ({
      accountId: account.accountId,
      code: account.code,
      name: account.name,
      amount: account.total,
      sharePct: marginPct(account.total, toDecimalString(whole)) ?? 0,
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

/**
 * The period a Ringkasan card compares itself against — "vs periode sebelumnya".
 *
 * NULL UNLESS BOTH ENDS ARE SET. "Semua" has no before, and a range open at
 * one end has no length to repeat; a delta against either would be invented.
 *
 * A WHOLE CALENDAR MONTH COMPARES TO THE WHOLE MONTH BEFORE IT, not to the
 * same number of days: "Bulan ini" in September is 30 days, and the 30 days
 * before it are 2–31 August — a comparison that quietly drops the 1st. Any
 * other range repeats its own length immediately before it, so "7 hari" is
 * compared with the seven days that preceded them.
 *
 * Calendar-date arithmetic in UTC, because these are dates rather than
 * instants and a local-time `Date` crossing a DST change would lose an hour
 * and, at midnight, a day.
 */
export function previousPeriod(dateFrom: string, dateTo: string): Period | null {
  if (!dateFrom || !dateTo) return null;

  const parse = (iso: string) => {
    const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const format = (date: Date) => date.toISOString().slice(0, 10);

  const from = parse(dateFrom);
  const to = parse(dateTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return null;
  }

  const lastOfMonth = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0),
  );
  const wholeMonth =
    from.getUTCDate() === 1 &&
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    to.getUTCDate() === lastOfMonth.getUTCDate();

  if (wholeMonth) {
    const month = from.getUTCMonth() === 0 ? 12 : from.getUTCMonth();
    const year =
      from.getUTCMonth() === 0 ? from.getUTCFullYear() - 1 : from.getUTCFullYear();
    return monthRange(year, month);
  }

  const DAY = 86_400_000;
  const length = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
  const prevTo = new Date(from.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (length - 1) * DAY);
  return { dateFrom: format(prevFrom), dateTo: format(prevTo) };
}

/**
 * How far `current` moved from `previous`, as a percentage of the previous
 * figure's SIZE — so a loss that shrank reads as an improvement, not as a
 * negative change of a negative number.
 *
 * NULL WHEN THE PREVIOUS PERIOD WAS ZERO: growth from nothing is not a
 * percentage, and "∞%" or "+100%" would both be a number nobody can use.
 */
export function changePct(current: string, previous: string): number | null {
  const before = minor(previous);
  if (before === 0n) return null;
  const size = before < 0n ? -before : before;
  return Number(((minor(current) - before) * 1000n) / size) / 10;
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
