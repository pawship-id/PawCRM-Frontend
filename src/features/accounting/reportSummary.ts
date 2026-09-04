import { toDecimalString, toMinor } from "@/utils/decimal";

import {
  CASHFLOW_ROWS,
  FIXTURE_LINES,
  PROFIT_LOSS_ROWS,
  type CashflowFixtureRow,
  type ProfitLossFixtureRow,
  type ProfitLossGroupKey,
} from "./data/reportFixtures";
import { SHARED_LINE_LABEL, SHARED_LINE_NONE } from "./financeSummary";

/**
 * The fold that turns ledger rows into the two reports — Laba Rugi per lini and
 * Arus Kas.
 *
 * THIS IS STANDING IN FOR THE SERVER, and it should not outlive it. Every
 * function here does arithmetic on money in a browser, which is exactly what
 * `/journal-entries/summary` and `/balances` were added to stop
 * (PawCRM-Backend/docs/finance-dashboard-gaps.md §2). It is acceptable only
 * because it folds a fixture of a dozen rows rather than a tenant's ledger; the
 * moment `GET /journal-entries/profit-loss` exists, the screens read its
 * response and this file loses its reason to be.
 *
 * WHAT SURVIVES THE SWAP is the SHAPE below, not the arithmetic. `ProfitLossMatrix`
 * is what the endpoint should return — columns first, then groups of accounts,
 * then the two derived result rows — so wiring it up later is a change of source
 * rather than a change of screen.
 *
 * EXACT ARITHMETIC THROUGHOUT. Amounts are decimal strings and every sum goes
 * through BigInt minor units; `Number` never touches a rupiah. The one place a
 * float appears is the percentage, which is a display value and rounded as one.
 */

/** Sums decimal strings exactly. Local rather than imported so it can subtract too. */
function total(values: Array<string | undefined>): string {
  return toDecimalString(
    values.reduce<bigint>((acc, value) => acc + (toMinor(value ?? "0") ?? 0n), 0n),
  );
}

/** `a − b`, exactly. */
function minus(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}

/** Element-wise `a − b` over two equal-length rows of cells. */
function minusRow(a: string[], b: string[]): string[] {
  return a.map((value, index) => minus(value, b[index] ?? "0"));
}

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
  key: ProfitLossGroupKey;
  label: string;
  accounts: MatrixAccount[];
}

export interface ProfitLossMatrix {
  columns: ReportColumn[];
  /** Pendapatan, HPP, Beban Operasional — always all three, even when empty. */
  groups: MatrixGroup[];
  /** Pendapatan − HPP. */
  grossProfit: MatrixRow;
  /** Laba kotor − beban operasional. */
  netProfit: MatrixRow;
  /** The base every margin percentage is taken against. */
  revenue: MatrixRow;
}

/**
 * Group headings, in the order a laba rugi is read.
 *
 * The order is the report's grammar rather than a preference: laba kotor only
 * means anything printed between HPP and beban operasional, so the array below
 * is what makes the result rows land where an accountant expects them.
 */
const GROUPS: Array<{ key: ProfitLossGroupKey; label: string }> = [
  { key: "revenue", label: "Pendapatan" },
  { key: "cogs", label: "Beban Pokok Penjualan (HPP)" },
  { key: "opex", label: "Beban Operasional" },
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
 * same list somebody just read for the whole shop.
 *
 * A ROW WITH NOTHING IN IT IS DROPPED, though, and only after the column filter
 * has been applied: a chart of accounts a tenant has grown for years would
 * otherwise print forty empty rows around the six that moved.
 */
export function profitLossMatrix(
  query: ReportQuery,
  rows: ProfitLossFixtureRow[] = PROFIT_LOSS_ROWS,
  lines: Array<{ _id: string; name: string }> = FIXTURE_LINES,
): ProfitLossMatrix {
  const columns = reportColumns(query.businessLineId, lines);

  /** One account's cells, once the cabang and the columns are settled. */
  const cellsFor = (row: ProfitLossFixtureRow): string[] =>
    columns.map((column) => {
      const key = column.id ?? "";
      const branches = query.branchId
        ? [query.branchId]
        : Object.keys(row.amounts);

      return total(branches.map((branch) => row.amounts[branch]?.[key]));
    });

  const groups: MatrixGroup[] = GROUPS.map(({ key, label }) => {
    const accounts: MatrixAccount[] = rows
      .filter((row) => row.group === key)
      .map((row) => {
        const cells = cellsFor(row);
        return { code: row.code, name: row.name, cells, total: total(cells) };
      })
      // Dropped after the fold, not before it: whether an account is empty is a
      // question about the cabang and the columns chosen, not about the account.
      .filter((account) => account.total !== "0.0000");

    return {
      key,
      label,
      accounts,
      cells: columns.map((_, index) =>
        total(accounts.map((account) => account.cells[index])),
      ),
      total: total(accounts.map((account) => account.total)),
    };
  });

  const [revenue, cogs, opex] = groups;
  const grossProfit: MatrixRow = {
    cells: minusRow(revenue.cells, cogs.cells),
    total: minus(revenue.total, cogs.total),
  };

  return {
    columns,
    groups,
    grossProfit,
    netProfit: {
      cells: minusRow(grossProfit.cells, opex.cells),
      total: minus(grossProfit.total, opex.total),
    },
    revenue: { cells: revenue.cells, total: revenue.total },
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
 * SALDO AKHIR IS DERIVED HERE AND NOWHERE ELSE, so the identity printed in the
 * card note — Saldo Akhir = Saldo Awal + Inflow − Outflow — is the definition
 * rather than a claim about it. A stored closing balance is a second source of
 * truth that starts disagreeing with its own inputs.
 *
 * AN ACCOUNT WITH NO ACTIVITY AT THIS CABANG IS DROPPED, not shown as a row of
 * zeros: a bank account the branch does not hold is not a balance of nothing, it
 * is not that branch's account.
 */
export function cashflowReport(
  branchId: string,
  rows: CashflowFixtureRow[] = CASHFLOW_ROWS,
): CashflowReport {
  /** Which cabang hold this account — the filter's, or all of them. */
  const held = (row: CashflowFixtureRow) =>
    (branchId ? [branchId] : Object.keys(row.amounts)).filter(
      (branch) => row.amounts[branch],
    );

  // Dropped BEFORE the fold, unlike the P&L's empty rows: an account the chosen
  // cabang does not hold is not a balance of zero, it is not that branch's
  // account. Whether it moved is a different question, and one a held account
  // may legitimately answer "no" to while still belonging in the table.
  const folded = rows
    .filter((row) => held(row).length > 0)
    .map((row) => {
      const branches = held(row);
      const saldoAwal = total(
        branches.map((branch) => row.amounts[branch]?.saldoAwal),
      );
      const inflow = total(
        branches.map((branch) => row.amounts[branch]?.inflow),
      );
      const outflow = total(
        branches.map((branch) => row.amounts[branch]?.outflow),
      );

      return {
        code: row.code,
        name: row.name,
        saldoAwal,
        inflow,
        outflow,
        saldoAkhir: minus(total([saldoAwal, inflow]), outflow),
      };
    });

  const totals = {
    saldoAwal: total(folded.map((row) => row.saldoAwal)),
    inflow: total(folded.map((row) => row.inflow)),
    outflow: total(folded.map((row) => row.outflow)),
    saldoAkhir: total(folded.map((row) => row.saldoAkhir)),
    netFlow: minus(
      total(folded.map((row) => row.inflow)),
      total(folded.map((row) => row.outflow)),
    ),
  };

  const closing = toMinor(totals.saldoAkhir) ?? 0n;

  return {
    rows: folded.map((row) => ({
      ...row,
      // ×1000 then ÷10 in BigInt, the same way `marginPct` keeps one decimal
      // without dividing money by money in floating point.
      share:
        closing === 0n
          ? null
          : Number(((toMinor(row.saldoAkhir) ?? 0n) * 1000n) / closing) / 10,
    })),
    totals,
  };
}

/**
 * The fixture surface, re-exported so a screen imports its data from one place.
 *
 * One import to delete per screen when the endpoint lands, rather than two.
 */
export {
  FIXTURE_BRANCHES,
  FIXTURE_LINES,
  FIXTURE_PERIOD_LABEL,
  type ProfitLossGroupKey,
} from "./data/reportFixtures";
