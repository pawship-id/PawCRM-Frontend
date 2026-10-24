import { toDecimalString, toMinor } from "@/utils/decimal";
import type { ProfitLossResult } from "@/services/journalEntry.service";
import type { AccountCategory } from "@/types/accounting";

import { marginPct } from "./financeSummary";
import { profitLossMatrix, type MatrixRow, type ReportColumn } from "./reportSummary";

/**
 * Laba rugi as the v3 mockup draws it: one column per MONTH (the last three,
 * oldest first), uraian down, and a badge where a figure moved ten percent or
 * more against the month before it.
 *
 * ARRANGEMENT ONLY, like `profitLossMatrix` which it is built on. Every amount
 * comes from `GET /journal-entries/profit-loss`, one read per month; the only
 * arithmetic here is the percentage change between two figures.
 *
 * EVERY ACCOUNT THAT MOVED IS A ROW, under its own category (BO, 18 Oktober
 * 2026). The statement used to pick its rows — penjualan kotor, diskon, the
 * consignment pair — and draw nothing for pendapatan and biaya lainnya, so a
 * month with seven stock adjustments credited to 5201 printed a laba bersih
 * Rp 1,5 jt above laba kotor with no line saying why. BO's rule: every figure
 * is the sum of the rows above it, and any income or expense account with a
 * value appears. So nothing here names an account any more; an account a tenant
 * adds shows up the month it first moves.
 *
 * LAID OUT THE WAY AN INDONESIAN LABA RUGI USUALLY IS (PSAK, and what Jurnal or
 * Accurate print), because a reader who could not tell which rows were added
 * and which subtracted read a laba bersih above laba kotor as an error:
 *
 *   - EVERY ROW IS SIGNED BY WHAT IT DOES TO LABA (the PSAK presentation, as
 *     a Tbk annual report prints it): income as is, HPP and biaya negative, so
 *     every subtotal is the rows above it added straight down. A cost account
 *     in credit — 5201 in a month of found stock — comes out positive, which
 *     is exactly what it did to laba;
 *   - a negative figure prints in brackets (the screen's job, see `format`);
 *   - every section opens with a heading;
 *   - pendapatan and biaya lainnya are ONE section, "Pendapatan (biaya)
 *     lain-lain", whose net is added to laba usaha.
 *
 * One consequence the screen relies on: with every figure signed by its effect,
 * a rise is good news on every row, so no row needs to say otherwise.
 */

/** Index 0 of a row's per-month array is the consolidated total, 1.. the lini. */
export type StatementValue = string | number | null;

export interface StatementRow {
  key: string;
  label: string;
  /** h = section heading (no figures), n = plain, i = indented detail, b = subtotal. */
  kind: "h" | "n" | "i" | "b";
  /** A margin: printed as a percentage, never badged. */
  pct?: boolean;
  /** `v[month][column]` — column 0 is the consolidated total. */
  v: StatementValue[][];
}

export interface ProfitLossStatement {
  columns: ReportColumn[];
  rows: StatementRow[];
}

/** ≥ this and the change gets a label; ≥ BIG it also tints the cell. */
export const CHANGE_THRESHOLD = 10;
export const CHANGE_BIG = 25;

/**
 * The three operating sections in report order. They are always drawn — a laba
 * rugi with no HPP line reads as a report that failed to load — though a section
 * with no account in it drops its heading, since a heading over nothing but its
 * own Rp 0 total is one line of noise.
 */
const SECTIONS: Array<{
  key: AccountCategory;
  heading: string;
  total: string;
  /** -1 for a cost: the server reports it positive, laba sees it subtracted. */
  sign: 1 | -1;
}> = [
  { key: "pendapatan", heading: "Pendapatan", total: "Total pendapatan", sign: 1 },
  { key: "hpp", heading: "HPP", total: "Total HPP", sign: -1 },
  { key: "biaya", heading: "Biaya operasional", total: "Total biaya operasional", sign: -1 },
];

export function profitLossStatement(
  results: ProfitLossResult[],
  lines: Array<{ _id: string; name: string }>,
  businessLineId: string | string[],
): ProfitLossStatement {
  const matrices = results.map((r) => profitLossMatrix(r, lines, businessLineId));
  const columns = matrices[0]?.columns ?? [];
  const width = columns.length + 1;

  type Matrix = (typeof matrices)[number];

  /** A MatrixRow flattened to [total, ...cells]. */
  const flat = (row: MatrixRow): string[] => [row.total, ...row.cells];
  const zeros = (): string[] => Array.from({ length: width }, () => "0.0000");
  const perMonth = (fn: (m: Matrix) => string[]) => matrices.map(fn);
  const group = (key: AccountCategory) => (m: Matrix) =>
    m.groups.find((g) => g.key === key)!;

  /**
   * One category's accounts as rows, in code order.
   *
   * THE UNION OF ACCOUNTS ACROSS THE THREE MONTHS, by code, so an account that
   * moved in only one of them still has a row in every column — Rp 0 in the
   * others — rather than shifting the rows under it month to month.
   */
  const accountRows = (key: AccountCategory, sign: 1 | -1) => {
    const names = new Map<string, string>();
    matrices.forEach((m) =>
      group(key)(m).accounts.forEach((a) => names.set(a.code, a.name)),
    );
    const codes = [...names.keys()].sort((a, b) =>
      a.localeCompare(b, "id", { numeric: true }),
    );

    return codes.map<StatementRow>((code) => ({
      key: `${key}-${code}`,
      label: names.get(code)!,
      kind: "i",
      v: perMonth((m) => {
        const found = group(key)(m).accounts.find((a) => a.code === code);
        return signed(found ? flat(found) : zeros(), sign);
      }),
    }));
  };

  const heading = (key: string, label: string): StatementRow => ({
    key: `h-${key}`,
    label,
    kind: "h",
    v: [],
  });

  const operating = ({ key, heading: title, total, sign }: (typeof SECTIONS)[number]) => {
    const accounts = accountRows(key, sign);
    return [
      ...(accounts.length > 0 ? [heading(key, title), ...accounts] : []),
      {
        key: `total-${key}`,
        label: total,
        kind: "n",
        v: perMonth((m) => signed(flat(group(key)(m)), sign)),
      } satisfies StatementRow,
    ];
  };

  const [pendapatan, hpp, biaya] = SECTIONS.map(operating);

  const net = perMonth((m) => flat(group("pendapatan")(m)));
  const marginOf = (num: string[][]): StatementValue[][] =>
    num.map((cells, mi) => cells.map((c, ci) => marginPct(c, net[mi][ci])));

  const grossProfit = perMonth((m) => flat(m.grossProfit));
  const operatingProfit = perMonth((m) => flat(m.operatingProfit));
  const netProfit = perMonth((m) => flat(m.netProfit));

  const rows: StatementRow[] = [
    ...pendapatan,
    ...hpp,
    { key: "gp", label: "Laba kotor", kind: "b", v: grossProfit },
    ...biaya,
  ];

  const otherRows = [
    ...accountRows("pendapatan_lainnya", 1),
    ...accountRows("biaya_lainnya", -1),
  ];

  // LABA USAHA AND THE LAIN-LAIN SECTION ONLY WHEN SOMETHING SITS THERE. With
  // neither, laba usaha is laba bersih under another name, one row apart.
  if (otherRows.length > 0) {
    rows.push(
      { key: "op", label: "Laba usaha", kind: "b", v: operatingProfit },
      heading("lainnya", "Pendapatan (biaya) lain-lain"),
      ...otherRows,
      {
        key: "total-lainnya",
        label: "Pendapatan (biaya) lain-lain, bersih",
        kind: "n",
        // The server's two bottom lines apart — exactly pendapatan lainnya
        // minus biaya lainnya, without adding up a row here.
        v: netProfit.map((cells, mi) =>
          cells.map((c, ci) => sub(c, operatingProfit[mi][ci])),
        ),
      },
    );
  }

  rows.push(
    { key: "np", label: "Laba bersih", kind: "b", v: netProfit },
    { key: "gm", label: "Margin kotor", kind: "n", pct: true, v: marginOf(grossProfit) },
    { key: "nm", label: "Margin bersih", kind: "n", pct: true, v: marginOf(netProfit) },
  );

  return { columns, rows };
}

function sub(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}

function signed(cells: string[], sign: 1 | -1): string[] {
  return sign === 1
    ? cells
    : cells.map((c) => toDecimalString(-(toMinor(c) ?? 0n)));
}

/**
 * How far `current` moved from `previous`, in percent, or null when there is no
 * base. Exact in minor units to one decimal, and signed by the figure's
 * direction: a negative baseline is divided by its magnitude, so a loss that
 * shrinks reads as a rise.
 *
 * Every statement row is signed by its effect on laba, so a fall is the bad news
 * on every one of them: a discount that grows, an HPP that grows (more
 * negative), a 5201 credit that shrinks back to zero.
 */
export function changeAgainst(current: string, previous: string): number | null {
  const base = toMinor(previous) ?? 0n;
  if (base === 0n) return null;
  const diff = (toMinor(current) ?? 0n) - base;
  const abs = base < 0n ? -base : base;
  return Number((diff * 1000n) / abs) / 10;
}
