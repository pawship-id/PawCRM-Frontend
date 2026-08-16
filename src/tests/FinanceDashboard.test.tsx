import { screen, within } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { FinanceDashboardScreen } from "@/features/accounting";
import {
  businessLinesIn,
  defaultPeriod,
  financeTransactions,
  fullPeriod,
  summarise,
  type FinanceQuery,
} from "@/features/accounting/financeSummary";
import { ACCOUNTS_BY_ID, DUMMY_ENTRIES } from "@/features/accounting/data/dummy";
import { sumDecimals, toMinor } from "@/utils/decimal";

/**
 * The Keuangan dashboard and the fold behind it.
 *
 * NOT A SINGLE FIXTURE FIGURE IS PINNED HERE, for the reason AccountingScreens
 * gives: the demo ledger grows, and a test asserting "Rp 110.750.000" is a test
 * somebody has to edit every time it does. What is pinned is the arithmetic's
 * own properties — the identities that must hold for ANY ledger, and which are
 * exactly what breaks when a sign or a filter is wrong:
 *
 *   - laba = pendapatan − beban;
 *   - the per-line figures partition the total, so the business-line filter
 *     cannot double-count or drop a rupiah;
 *   - the cash card is a position, so widening the START of the range moves the
 *     P&L and leaves the balance alone;
 *   - the table shows only entries that moved the P&L, and never more than ten.
 */

const PERIOD = defaultPeriod(DUMMY_ENTRIES);

function query(patch: Partial<FinanceQuery> = {}): FinanceQuery {
  return { ...PERIOD, branchName: "", businessLines: [], ...patch };
}

function minor(value: string): bigint {
  return toMinor(value) ?? 0n;
}

describe("summarise", () => {
  it("keeps laba = pendapatan − beban", () => {
    const summary = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());

    expect(minor(summary.netProfit)).toBe(
      minor(summary.revenue) - minor(summary.expense),
    );
    // A month with nothing in it would make every other assertion vacuous.
    expect(minor(summary.revenue)).toBeGreaterThan(0n);
  });

  it("splits the period across business lines without losing any of it", () => {
    const total = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());

    const perLineRevenue = sumDecimals(
      total.perLine.map((line) => line.revenue),
    );
    const perLineExpense = sumDecimals(
      total.perLine.map((line) => line.expense),
    );

    expect(minor(perLineRevenue)).toBe(minor(total.revenue));
    expect(minor(perLineExpense)).toBe(minor(total.expense));
  });

  it("filtering one line at a time adds back up to the unfiltered total", () => {
    const total = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());

    const summed = businessLinesIn(DUMMY_ENTRIES).reduce(
      (running, line) =>
        running +
        minor(
          summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query({ businessLines: [line] }))
            .revenue,
        ),
      0n,
    );

    expect(summed).toBe(minor(total.revenue));
  });

  it("treats the cash card as a position, not a period figure", () => {
    const month = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());
    const openEnded = summarise(
      DUMMY_ENTRIES,
      ACCOUNTS_BY_ID,
      query({ from: "" }),
    );

    // Dropping the start of the range pulls in earlier entries...
    expect(minor(openEnded.revenue)).toBeGreaterThan(minor(month.revenue));
    // ...but the balance was already cumulative to the end date.
    expect(minor(openEnded.cashBalance)).toBe(minor(month.cashBalance));
  });

  it("leaves the cash position alone when a business line is picked", () => {
    const all = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());
    const grooming = summarise(
      DUMMY_ENTRIES,
      ACCOUNTS_BY_ID,
      query({ businessLines: ["Grooming"] }),
    );

    expect(minor(grooming.revenue)).toBeLessThan(minor(all.revenue));
    expect(minor(grooming.cashBalance)).toBe(minor(all.cashBalance));
  });

  it("narrows to one branch", () => {
    const all = summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());
    const one = summarise(
      DUMMY_ENTRIES,
      ACCOUNTS_BY_ID,
      query({ branchName: "Cabang BSD" }),
    );

    expect(one.entryCount).toBeLessThan(all.entryCount);
    expect(minor(one.revenue)).toBeLessThan(minor(all.revenue));
  });
});

describe("financeTransactions", () => {
  it("lists only entries that moved the profit and loss", () => {
    const rows = financeTransactions(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.accounts.length).toBeGreaterThan(0);
      expect(minor(row.amount)).toBeGreaterThan(0n);
    }

    // A goods receipt debits stock and credits the supplier — real, but neither
    // income nor expense, so it has no place in a list under the P&L cards.
    const receipt = DUMMY_ENTRIES.find(
      (entry) => entry.source.type === "goods_receipt",
    )!;
    expect(rows.some((row) => row.entryId === receipt._id)).toBe(false);
  });

  it("marks a sales return as revenue going down, not another sale", () => {
    const returned = DUMMY_ENTRIES.find(
      (entry) => entry.source.type === "return",
    )!;
    const rows = financeTransactions(
      DUMMY_ENTRIES,
      ACCOUNTS_BY_ID,
      query(fullPeriod(DUMMY_ENTRIES)),
    );

    const row = rows.find((item) => item.entryId === returned._id)!;
    expect(row.type).toBe("income");
    expect(row.reversal).toBe(true);
    // Positive, because the direction is `reversal`'s job — the screen prints
    // the minus sign, and printing it twice is how a column stops adding up.
    expect(minor(row.amount)).toBeGreaterThan(0n);
  });

  it("takes the newest rows when a limit is given", () => {
    const all = financeTransactions(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query());
    const capped = financeTransactions(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query(), 3);

    expect(capped).toHaveLength(3);
    expect(capped.map((row) => row.entryId)).toEqual(
      all.slice(0, 3).map((row) => row.entryId),
    );
  });
});

describe("FinanceDashboardScreen", () => {
  it("shows the four summary figures and the period's transactions", () => {
    renderWithAuth(<FinanceDashboardScreen />);

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Total Expense")).toBeInTheDocument();
    expect(screen.getByText("Net Profit")).toBeInTheDocument();
    expect(screen.getByText("Saldo Kas & Bank")).toBeInTheDocument();

    const table = screen.getByRole("table");
    // Ten rows at most, plus the header row.
    expect(within(table).getAllByRole("row").length).toBeLessThanOrEqual(11);
  });

  it("hands off to the ledger for the full list", () => {
    renderWithAuth(<FinanceDashboardScreen />);

    expect(screen.getByRole("link", { name: /Lihat semua/ })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/journal-entries",
    );
  });

  it("explains itself instead of showing zeroes without ledger access", () => {
    renderWithAuth(<FinanceDashboardScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(screen.queryByText("Total Revenue")).not.toBeInTheDocument();
    expect(screen.getByText(/belum punya akses ke jurnal umum/i)).toBeInTheDocument();
  });
});
