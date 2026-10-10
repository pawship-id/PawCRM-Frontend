import { toDecimalString, toMinor } from "@/utils/decimal";
import type { ProfitLossResult } from "@/services/journalEntry.service";

import { marginPct } from "./financeSummary";
import { profitLossMatrix, type MatrixRow, type ReportColumn } from "./reportSummary";

/**
 * Laba rugi as the v3 mockup draws it: one column per MONTH (the last three,
 * oldest first), uraian down, and a badge where a figure moved ten percent or
 * more against the month before it.
 *
 * ARRANGEMENT ONLY, like `profitLossMatrix` which it is built on. Every amount
 * comes from `GET /journal-entries/profit-loss`, one read per month; the only
 * arithmetic here is the gross/discount split (4191 Diskon Penjualan is a contra
 * account inside Pendapatan) and the percentage change between two figures.
 */

/** Index 0 of a row's per-month array is the consolidated total, 1.. the lini. */
export type StatementValue = string | number | null;

export interface StatementRow {
  key: string;
  label: string;
  /** n = plain, i = indented detail, b = subtotal. */
  kind: "n" | "i" | "b";
  /** A margin: printed as a percentage, never badged. */
  pct?: boolean;
  /** Whether a RISE in this figure is bad news (costs, discount, HPP). */
  riseIsBad: boolean;
  /** Stored negative (discount): a bigger magnitude is a fall in the figure. */
  invert?: boolean;
  /** Whether the Per lini bisnis view lists and expands this row. */
  inLini: boolean;
  /** `v[month][column]` — column 0 is the consolidated total. */
  v: StatementValue[][];
}

export interface ProfitLossStatement {
  columns: ReportColumn[];
  rows: StatementRow[];
}

/** The 4191 contra account that turns "penjualan kotor" into "bersih". */
export const DISCOUNT_ACCOUNT = "4191";

/** ≥ this and the change gets a label; ≥ BIG it also tints the cell. */
export const CHANGE_THRESHOLD = 10;
export const CHANGE_BIG = 25;

const ZERO = "0.0000";

function sub(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}

export function profitLossStatement(
  results: ProfitLossResult[],
  lines: Array<{ _id: string; name: string }>,
  businessLineId: string | string[],
): ProfitLossStatement {
  const matrices = results.map((r) => profitLossMatrix(r, lines, businessLineId));
  const columns = matrices[0]?.columns ?? [];
  const width = columns.length + 1;

  /** A MatrixRow flattened to [total, ...cells]. */
  const flat = (row: MatrixRow): string[] => [row.total, ...row.cells];
  const zeros = (): string[] => Array.from({ length: width }, () => ZERO);

  const group = (key: string) => (m: (typeof matrices)[number]) =>
    m.groups.find((g) => g.key === key)!;

  const accountIn = (key: string, code: string) => (m: (typeof matrices)[number]) => {
    const found = group(key)(m).accounts.find((a) => a.code === code);
    return found ? flat(found) : zeros();
  };

  const perMonth = (fn: (m: (typeof matrices)[number]) => string[]) =>
    matrices.map(fn);

  const discount = perMonth(accountIn("pendapatan", DISCOUNT_ACCOUNT));
  const net = perMonth((m) => flat(group("pendapatan")(m)));
  const gross = net.map((cells, mi) => cells.map((c, ci) => sub(c, discount[mi][ci])));

  // Union of expense accounts across the three months, by account number, so a
  // row exists in every column even if it only moved in one month.
  const expense = new Map<string, string>();
  matrices.forEach((m) =>
    group("biaya")(m).accounts.forEach((a) => expense.set(a.code, a.name)),
  );
  const expenseCodes = [...expense.keys()].sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true }),
  );

  const marginOf = (num: string[][]): StatementValue[][] =>
    num.map((cells, mi) => cells.map((c, ci) => marginPct(c, net[mi][ci])));

  const grossProfit = perMonth((m) => flat(m.grossProfit));
  const netProfit = perMonth((m) => flat(m.netProfit));

  const rows: StatementRow[] = [
    { key: "gross", label: "Penjualan kotor", kind: "n", riseIsBad: false, inLini: false, v: gross },
    { key: "discount", label: "Diskon dan potongan", kind: "i", riseIsBad: true, invert: true, inLini: false, v: discount },
    { key: "net", label: "Penjualan bersih", kind: "b", riseIsBad: false, inLini: true, v: net },
    { key: "hpp", label: "HPP", kind: "n", riseIsBad: true, inLini: true, v: perMonth((m) => flat(group("hpp")(m))) },
    { key: "gp", label: "Laba kotor", kind: "b", riseIsBad: false, inLini: true, v: grossProfit },
    ...expenseCodes.map<StatementRow>((code) => ({
      key: `biaya-${code}`,
      label: expense.get(code)!,
      kind: "i",
      riseIsBad: true,
      inLini: true,
      v: perMonth(accountIn("biaya", code)),
    })),
    { key: "tb", label: "Total biaya operasional", kind: "n", riseIsBad: true, inLini: true, v: perMonth((m) => flat(group("biaya")(m))) },
  ];

  // LABA BERSIH IS THE SERVER'S bottom line, which also carries pendapatan and
  // biaya lainnya. The mockup draws no rows for those two, so they are not
  // listed; a month that has any makes laba bersih differ from laba kotor minus
  // total biaya by exactly that amount.
  rows.push(
    { key: "np", label: "Laba bersih", kind: "b", riseIsBad: false, inLini: true, v: netProfit },
    { key: "gm", label: "Margin kotor", kind: "n", pct: true, riseIsBad: false, inLini: true, v: marginOf(grossProfit) },
    { key: "nm", label: "Margin bersih", kind: "n", pct: true, riseIsBad: false, inLini: true, v: marginOf(netProfit) },
  );

  return { columns, rows };
}

/**
 * How far `current` moved from `previous`, in percent, or null when there is no
 * base. Exact in minor units to one decimal, and signed by the figure's
 * direction: a negative baseline is divided by its magnitude, so a loss that
 * shrinks reads as a rise.
 */
export function changeAgainst(current: string, previous: string): number | null {
  const base = toMinor(previous) ?? 0n;
  if (base === 0n) return null;
  const diff = (toMinor(current) ?? 0n) - base;
  const abs = base < 0n ? -base : base;
  return Number((diff * 1000n) / abs) / 10;
}
