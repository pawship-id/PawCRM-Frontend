import { toDecimalString, toMinor } from "@/utils/decimal";
import type {
  AccountBalance,
  ProfitLossResult,
  ProfitLossRow,
} from "@/services/journalEntry.service";
import type { AccountCategory } from "@/types/accounting";

import { ACCOUNT_CATEGORY_LABEL } from "./labels";
import { SHARED_LINE_LABEL, SHARED_LINE_NONE } from "./financeSummary";

/**
 * The arrangement that turns a report's API response into the table a screen
 * draws — Laba Rugi per lini and Arus Kas.
 *
 * WHAT CHANGED HERE, 18 September 2026. This file used to fold a FIXTURE and
 * carried a note saying it should not outlive the endpoint, because every
 * function in it was doing arithmetic on money in a browser
 * (PawCRM-Backend/docs/finance-dashboard-gaps.md §2). Both endpoints now exist,
 * and the fixture is gone:
 *
 *   Laba Rugi → `GET /journal-entries/profit-loss`, which returns the five
 *               groups, every account that moved, and the three subtotals
 *               already derived from each other.
 *   Arus Kas  → two reads of `GET /journal-entries/balances`, one at each end of
 *               the period, filtered to `accountCategory: "cash_bank"`.
 *
 * SO NOTHING HERE ADDS UP MONEY ANY MORE — except the one subtraction Arus Kas
 * needs, and that one is stated below with its reason. What is left is
 * ARRANGEMENT: which column a cell belongs in, which rows are empty, what a
 * group is called. That is a view's job and it stays here.
 */

/* -------------------------------------------------------------- laba rugi */

/** One column of the matrix. `id: null` is the shared bucket. */
export interface ReportColumn {
  id: string | null;
  label: string;
}

/** One account's row, or a group's subtotal — the same shape either way. */
export interface MatrixRow {
  /** One amount per column, in `columns` order. */
  cells: string[];
  /** The consolidated column: the row summed across every visible line. */
  total: string;
}

export interface MatrixAccount extends MatrixRow {
  code: string;
  name: string;
}

export interface MatrixGroup extends MatrixRow {
  key: AccountCategory;
  label: string;
  accounts: MatrixAccount[];
  /**
   * Whether the group is SUBTRACTED in the formula, which is what decides
   * whether it prints with a leading minus. The amounts themselves stay
   * positive: a report prints "Beban Sewa 15.000.000", not "−15.000.000", until
   * it is being taken away from something.
   */
  negative: boolean;
}

export interface ProfitLossMatrix {
  columns: ReportColumn[];
  /** Always all five, in report order, even when a group is empty. */
  groups: MatrixGroup[];
  /** Pendapatan − HPP. */
  grossProfit: MatrixRow;
  /** Laba kotor − biaya. */
  operatingProfit: MatrixRow;
  /** Laba usaha + pendapatan lainnya − biaya lainnya. */
  netProfit: MatrixRow;
  /** The base every margin percentage is taken against. */
  revenue: MatrixRow;
}

/**
 * The five groups in the order the report is read, and which side each is on.
 *
 * THE ORDER IS THE REPORT'S GRAMMAR rather than a preference: laba kotor only
 * means anything printed between HPP and Biaya, and laba usaha only between
 * Biaya and the two "Lainnya" buckets. It matches PROFIT_LOSS_CATEGORIES on the
 * server, which is what the response is ordered by.
 */
const GROUPS: Array<{ key: AccountCategory; negative: boolean }> = [
  { key: "pendapatan", negative: false },
  { key: "hpp", negative: true },
  { key: "biaya", negative: true },
  { key: "pendapatan_lainnya", negative: false },
  { key: "biaya_lainnya", negative: true },
];

export interface ReportQuery {
  /** "" = semua cabang. */
  branchId: string;
  /** "" = semua lini, `SHARED_LINE_NONE` = hanya yang tak terikat lini. */
  businessLineId: string;
}

/**
 * The laba rugi matrix: accounts down, lini bisnis across.
 *
 * `businessLineId` DROPS COLUMNS RATHER THAN FILTERING ROWS, which is the one
 * thing about this report that is not obvious. Narrowing to Grooming does not
 * hide the accounts grooming does not touch — it shows the same chart with one
 * column, so "what did grooming cost us" is answered line by line against the
 * same list somebody just read for the whole shop. It is also why the screen
 * does NOT send `businessLineId` to the API: the response has to carry every
 * column for the consolidated total to stay comparable.
 *
 * `branchId` IS sent to the API, because that one genuinely selects a different
 * set of entries rather than a different view of the same ones.
 *
 * A ROW WITH NOTHING IN IT IS DROPPED, and only after the column filter has been
 * applied: a chart a tenant has grown for years would otherwise print forty
 * empty rows around the six that moved. Whether an account is empty is a
 * question about the columns chosen, not about the account.
 */
export function profitLossMatrix(
  result: ProfitLossResult,
  lines: Array<{ _id: string; name: string }>,
  businessLineId: string,
): ProfitLossMatrix {
  const columns = reportColumns(businessLineId, lines);

  /** A response row's cells, in column order. Absent line → an explicit zero. */
  const cellsOf = (row: ProfitLossRow): string[] => {
    const byLine = new Map(
      row.lines.map((cell) => [cell.businessLineId ?? "", cell.amount]),
    );
    return columns.map((column) => byLine.get(column.id ?? "") ?? "0.0000");
  };

  /**
   * A row's consolidated total.
   *
   * RE-SUMMED FROM THE VISIBLE CELLS rather than taken from `row.total`, and
   * this is the one place that matters: `row.total` spans every line, so with a
   * column filter applied the screen would show one column of Grooming beside a
   * "Total Konsolidasi" that quietly included retail. The unfiltered case sums
   * to exactly the server's own figure.
   */
  const rowOf = (row: ProfitLossRow): MatrixRow => {
    const cells = cellsOf(row);
    return { cells, total: sum(cells) };
  };

  const byCategory = new Map(
    result.categories.map((group) => [group.accountCategory, group]),
  );

  const groups: MatrixGroup[] = GROUPS.map(({ key, negative }) => {
    const group = byCategory.get(key);
    const accounts: MatrixAccount[] = result.accounts
      .filter((account) => account.accountCategory === key)
      .map((account) => ({
        code: account.code,
        name: account.name,
        ...rowOf(account),
      }))
      .filter((account) => !isZero(account.total));

    return {
      key,
      label: ACCOUNT_CATEGORY_LABEL[key],
      negative,
      accounts,
      ...(group
        ? rowOf(group)
        : { cells: columns.map(() => "0.0000"), total: "0.0000" }),
    };
  });

  return {
    columns,
    groups,
    grossProfit: rowOf(result.results.grossProfit),
    operatingProfit: rowOf(result.results.operatingProfit),
    netProfit: rowOf(result.results.netProfit),
    revenue: groups[0],
  };
}

/**
 * The columns the matrix shows, shared bucket last.
 *
 * LAST RATHER THAN FIRST, and never sorted away: "Bersama" is where sewa, gaji
 * kantor and listrik land, so a matrix without it would show three profitable
 * lines and no rent. It sits at the end because it is the one column that is not
 * a line of business, which is also why it reads as a name rather than as an id.
 */
function reportColumns(
  businessLineId: string,
  lines: Array<{ _id: string; name: string }>,
): ReportColumn[] {
  const all: ReportColumn[] = [
    ...lines.map((line) => ({ id: line._id, label: line.name })),
    { id: null, label: SHARED_LINE_LABEL },
  ];

  if (!businessLineId) return all;
  if (businessLineId === SHARED_LINE_NONE) {
    return all.filter((column) => column.id === null);
  }
  return all.filter((column) => column.id === businessLineId);
}

/* --------------------------------------------------------------- arus kas */

export interface CashflowAccountRow {
  code: string;
  name: string;
  saldoAwal: string;
  inflow: string;
  outflow: string;
  /** Derived, never stored: `saldoAwal + inflow − outflow`. */
  saldoAkhir: string;
  /**
   * This account's share of the closing balance, 0–100, or null when there is
   * no closing balance to take a share of.
   */
  share: number | null;
}

export interface CashflowReport {
  rows: CashflowAccountRow[];
  totals: {
    saldoAwal: string;
    inflow: string;
    outflow: string;
    saldoAkhir: string;
    /** Inflow − outflow. The period's movement, as distinct from the position. */
    netFlow: string;
  };
}

/**
 * Kas dan bank over the period: where it started, what moved, where it ended.
 *
 * BUILT FROM TWO TRIAL BALANCES, one at each end, rather than from an endpoint
 * of its own. `balances` is cumulative from inception and returns both SIDES, so
 * the period's movement is the difference between the two reads — inflow is
 * `debit(akhir) − debit(awal)`, outflow the same on the credit side. An endpoint
 * that answered this directly would be a third way of asking one question the
 * ledger already answers twice.
 *
 * THE SUBTRACTION IS THE ONE PIECE OF ARITHMETIC LEFT IN THIS FILE. It is exact
 * — BigInt minor units, never `Number` — and it is here rather than on the
 * server because neither read knows about the other.
 *
 * SALDO AKHIR IS DERIVED, so the identity printed in the card note — Saldo Akhir
 * = Saldo Awal + Inflow − Outflow — is the definition rather than a claim about
 * it. It comes out equal to the closing read's own `balance`, which is what
 * makes the two reads a check on each other rather than two sources of truth.
 *
 * AN ACCOUNT WITH NO OPENING BALANCE AND NO MOVEMENT IS DROPPED: a bank account
 * the branch does not hold is not a balance of nothing, it is not that branch's
 * account. One that is held and simply did not move stays, as a row of zeros
 * around a real saldo awal.
 */
export function cashflowReport(
  opening: AccountBalance[],
  closing: AccountBalance[],
): CashflowReport {
  const openingByAccount = new Map(
    opening.map((account) => [account.accountId, account]),
  );

  // Driven by the CLOSING read, which is the superset in every ordinary case: an
  // account can acquire its first posting during the period, but one that had a
  // balance before it cannot lose its history.
  const seen = new Map(closing.map((account) => [account.accountId, account]));
  for (const account of opening) {
    if (!seen.has(account.accountId)) seen.set(account.accountId, account);
  }

  const rows = [...seen.values()]
    .map((account) => {
      const before = openingByAccount.get(account.accountId);
      const isClosing = closing.some(
        (row) => row.accountId === account.accountId,
      );

      const saldoAwal = before?.balance ?? "0.0000";
      const inflow = minus(
        isClosing ? account.debit : "0.0000",
        before?.debit ?? "0.0000",
      );
      const outflow = minus(
        isClosing ? account.credit : "0.0000",
        before?.credit ?? "0.0000",
      );

      return {
        code: account.code,
        name: account.name,
        saldoAwal,
        inflow,
        outflow,
        saldoAkhir: minus(sum([saldoAwal, inflow]), outflow),
      };
    })
    .filter(
      (row) =>
        !isZero(row.saldoAwal) || !isZero(row.inflow) || !isZero(row.outflow),
    )
    // By account number, the order a chart of accounts is read in. The two reads
    // arrive sorted; merging them can interleave.
    .sort((a, b) => a.code.localeCompare(b.code, "id", { numeric: true }));

  const totals = {
    saldoAwal: sum(rows.map((row) => row.saldoAwal)),
    inflow: sum(rows.map((row) => row.inflow)),
    outflow: sum(rows.map((row) => row.outflow)),
    saldoAkhir: sum(rows.map((row) => row.saldoAkhir)),
    netFlow: minus(
      sum(rows.map((row) => row.inflow)),
      sum(rows.map((row) => row.outflow)),
    ),
  };

  const closingTotal = toMinor(totals.saldoAkhir) ?? 0n;

  return {
    rows: rows.map((row) => ({
      ...row,
      // ×1000 then ÷10 in BigInt, the same way `marginPct` keeps one decimal
      // without dividing money by money in floating point.
      share:
        closingTotal === 0n
          ? null
          : Number(((toMinor(row.saldoAkhir) ?? 0n) * 1000n) / closingTotal) /
            10,
    })),
    totals,
  };
}

/* ----------------------------------------------------------------- exact */

/** Sums decimal strings exactly, through BigInt minor units. */
function sum(values: Array<string | undefined>): string {
  return toDecimalString(
    values.reduce<bigint>((acc, value) => acc + (toMinor(value ?? "0") ?? 0n), 0n),
  );
}

/** `a − b`, exactly. */
function minus(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}

/**
 * Whether a money string is zero — compared in MINOR UNITS, not against the
 * literal "0.0000". The server writes that spelling, but a value that has been
 * through a subtraction here can be "-0.0000", and a row dropped by string
 * comparison but kept by arithmetic is the kind of mismatch nobody finds.
 */
function isZero(value: string): boolean {
  return (toMinor(value) ?? 0n) === 0n;
}
