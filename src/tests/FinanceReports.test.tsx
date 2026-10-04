import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BalanceSheetScreen,
  CashflowScreen,
  ProfitLossScreen,
} from "@/features/accounting";
import {
  balanceSheet,
  cashflowReport,
  profitLossMatrix,
} from "@/features/accounting";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type {
  AccountBalance,
  ProfitLossResult,
} from "@/services/journalEntry.service";

jest.mock("@/services/journalEntry.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");

/**
 * The three reading reports — Laba Rugi, Neraca, Arus Kas.
 *
 * THESE USED TO ASSERT AGAINST A FIXTURE and to check that each page ADMITTED
 * its figures were examples. All three read the ledger now, so the services are
 * stubbed and the "angka masih contoh" assertions are gone — their replacement
 * is the one at the end of each screen block, which is that the banner is NOT
 * there any more.
 *
 * WHAT IS WORTH ASSERTING, given the numbers come from a stub:
 *
 *   - the ARRANGEMENT the folds do, which is all that is left in the browser:
 *     which column a cell lands in, which rows are dropped, what a subtotal is
 *     placed under;
 *   - the two things the server cannot do for us — the column filter, which
 *     drops columns rather than rows, and the arus kas subtraction between two
 *     cumulative reads;
 *   - laba ditahan, which is DERIVED from the income and expense rows and is the
 *     one figure on the neraca with no account behind it;
 *   - that each screen asks for the right thing: the P&L must NOT send a
 *     business line, and arus kas must read the day BEFORE the period starts.
 *
 * A FIXED `now` is passed to all three. The screens take one so the date presets
 * do not read the clock; a test that let them would fail on a month boundary.
 */

const NOW = "2026-08-17T03:00:00.000Z";
const GROOMING = "bl-grooming";
const RETAIL = "bl-retail";
const SHARED = "Bersama (HQ)";

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/* ------------------------------------------------------------- P&L fixture */

/** One row of the API response: an account and what it came to per line. */
const plAccount = (
  code: string,
  name: string,
  accountCategory: ProfitLossResult["accounts"][number]["accountCategory"],
  cells: Array<[string | null, string]>,
) => ({
  accountId: `acc-${code}`,
  code,
  name,
  accountCategory,
  accountType: (accountCategory === "pendapatan" ||
  accountCategory === "pendapatan_lainnya"
    ? "income"
    : "expense") as "income" | "expense",
  lines: cells.map(([businessLineId, amount]) => ({ businessLineId, amount })),
  total: cells
    .reduce((sum, [, amount]) => sum + Math.round(Number(amount) * 10000), 0)
    .toString()
    .replace(/(\d+)$/, (n) => (Number(n) / 10000).toFixed(4)),
});

/**
 * Amounts chosen so every subtotal is a round number a reader can check:
 *
 *   pendapatan 40.000.000 − hpp 22.000.000  = laba kotor      18.000.000
 *   laba kotor − biaya 8.000.000            = laba usaha      10.000.000
 *   laba usaha + lainnya 1.000.000 − 400.000 = laba bersih    10.600.000
 */
const PROFIT_LOSS: ProfitLossResult = {
  period: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    timezone: "Asia/Jakarta",
  },
  accounts: [
    plAccount("4101", "Pendapatan Penjualan", "pendapatan", [
      [GROOMING, "25000000.0000"],
      [RETAIL, "17000000.0000"],
      [null, "0.0000"],
    ]),
    // A contra account: stored negative, because the server signs it by the
    // class it sits in. It nets against the revenue beside it.
    plAccount("4191", "Diskon Penjualan", "pendapatan", [
      [GROOMING, "-2000000.0000"],
      [RETAIL, "0.0000"],
      [null, "0.0000"],
    ]),
    // Nothing moved here at all — the row a matrix must DROP rather than print
    // as a line of dashes.
    plAccount("4102", "Penjualan Jasa", "pendapatan", [
      [GROOMING, "0.0000"],
      [RETAIL, "0.0000"],
      [null, "0.0000"],
    ]),
    plAccount("5101", "Harga Pokok Penjualan", "hpp", [
      [GROOMING, "10000000.0000"],
      [RETAIL, "12000000.0000"],
      [null, "0.0000"],
    ]),
    plAccount("6102", "Beban Sewa", "biaya", [
      [GROOMING, "0.0000"],
      [RETAIL, "0.0000"],
      [null, "8000000.0000"],
    ]),
    plAccount("4901", "Pendapatan Lain-lain", "pendapatan_lainnya", [
      [GROOMING, "0.0000"],
      [RETAIL, "0.0000"],
      [null, "1000000.0000"],
    ]),
    plAccount("5301", "Beban Bank", "biaya_lainnya", [
      [GROOMING, "0.0000"],
      [RETAIL, "0.0000"],
      [null, "400000.0000"],
    ]),
  ],
  categories: [
    {
      accountCategory: "pendapatan",
      lines: [
        { businessLineId: GROOMING, amount: "23000000.0000" },
        { businessLineId: RETAIL, amount: "17000000.0000" },
        { businessLineId: null, amount: "0.0000" },
      ],
      total: "40000000.0000",
    },
    {
      accountCategory: "hpp",
      lines: [
        { businessLineId: GROOMING, amount: "10000000.0000" },
        { businessLineId: RETAIL, amount: "12000000.0000" },
        { businessLineId: null, amount: "0.0000" },
      ],
      total: "22000000.0000",
    },
    {
      accountCategory: "biaya",
      lines: [
        { businessLineId: GROOMING, amount: "0.0000" },
        { businessLineId: RETAIL, amount: "0.0000" },
        { businessLineId: null, amount: "8000000.0000" },
      ],
      total: "8000000.0000",
    },
    {
      accountCategory: "pendapatan_lainnya",
      lines: [
        { businessLineId: GROOMING, amount: "0.0000" },
        { businessLineId: RETAIL, amount: "0.0000" },
        { businessLineId: null, amount: "1000000.0000" },
      ],
      total: "1000000.0000",
    },
    {
      accountCategory: "biaya_lainnya",
      lines: [
        { businessLineId: GROOMING, amount: "0.0000" },
        { businessLineId: RETAIL, amount: "0.0000" },
        { businessLineId: null, amount: "400000.0000" },
      ],
      total: "400000.0000",
    },
  ],
  results: {
    grossProfit: {
      lines: [
        { businessLineId: GROOMING, amount: "13000000.0000" },
        { businessLineId: RETAIL, amount: "5000000.0000" },
        { businessLineId: null, amount: "0.0000" },
      ],
      total: "18000000.0000",
    },
    operatingProfit: {
      lines: [
        { businessLineId: GROOMING, amount: "13000000.0000" },
        { businessLineId: RETAIL, amount: "5000000.0000" },
        { businessLineId: null, amount: "-8000000.0000" },
      ],
      total: "10000000.0000",
    },
    netProfit: {
      lines: [
        { businessLineId: GROOMING, amount: "13000000.0000" },
        { businessLineId: RETAIL, amount: "5000000.0000" },
        { businessLineId: null, amount: "-7400000.0000" },
      ],
      total: "10600000.0000",
    },
  },
};

const LINES = [
  { _id: GROOMING, name: "Grooming", color: "#0D9488" },
  { _id: RETAIL, name: "Retail", color: "#B45309" },
];

/* -------------------------------------------------------- balance fixtures */

const balance = (
  code: string,
  name: string,
  accountCategory: AccountBalance["accountCategory"],
  accountType: AccountBalance["accountType"],
  { debit = "0.0000", credit = "0.0000" } = {},
): AccountBalance => {
  const debitNormal = accountType === "asset" || accountType === "expense";
  const minor = (value: string) => Math.round(Number(value) * 10000);
  const net = debitNormal
    ? minor(debit) - minor(credit)
    : minor(credit) - minor(debit);

  return {
    accountId: `acc-${code}`,
    code,
    name,
    accountType,
    accountCategory,
    normalBalance: debitNormal ? "debit" : "credit",
    debit,
    credit,
    balance: (net / 10000).toFixed(4),
  };
};

/**
 * A tenant whose books balance:
 *   aset 55.000.000 = kewajiban 15.000.000 + modal 30.000.000 + laba 10.000.000
 */
const TRIAL_BALANCE: AccountBalance[] = [
  balance("1101", "Kas", "cash_bank", "asset", { debit: "30000000.0000" }),
  balance("1201", "Persediaan", "persediaan", "asset", {
    debit: "25000000.0000",
  }),
  balance("2101", "Utang Usaha", "hutang_dagang", "liability", {
    credit: "15000000.0000",
  }),
  balance("3101", "Modal", "modal", "equity", { credit: "30000000.0000" }),
  balance("4101", "Pendapatan Penjualan", "pendapatan", "income", {
    credit: "40000000.0000",
  }),
  balance("5101", "HPP", "hpp", "expense", { debit: "30000000.0000" }),
];

/** Kas at the start of the period, and the same account at the end. */
const CASH_OPENING: AccountBalance[] = [
  balance("1101", "Kas", "cash_bank", "asset", { debit: "10000000.0000" }),
];
const CASH_CLOSING: AccountBalance[] = [
  balance("1101", "Kas", "cash_bank", "asset", {
    debit: "18000000.0000",
    credit: "3000000.0000",
  }),
  // First posted during the period: no opening row at all.
  balance("1102", "Bank BCA", "cash_bank", "asset", {
    debit: "5000000.0000",
  }),
];

function stubLookups() {
  asMock(branchService.list).mockResolvedValue({
    items: [
      { _id: "br-1", name: "Cabang Kemang" },
      { _id: "br-2", name: "Cabang Bintaro" },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never);
  asMock(businessLineService.list).mockResolvedValue({
    items: LINES,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never);
}

beforeEach(() => {
  stubLookups();
  asMock(journalEntryService.profitLoss).mockResolvedValue(PROFIT_LOSS);
  asMock(journalEntryService.balances).mockResolvedValue({
    asOf: "2026-08-31",
    timezone: "Asia/Jakarta",
    accounts: TRIAL_BALANCE,
  });
});

/* --------------------------------------------------------------- the folds */

describe("profitLossMatrix", () => {
  it("lays the five groups out in report order", () => {
    const matrix = profitLossMatrix(PROFIT_LOSS, LINES, "");

    expect(matrix.groups.map((group) => group.key)).toEqual([
      "pendapatan",
      "hpp",
      "biaya",
      "pendapatan_lainnya",
      "biaya_lainnya",
    ]);
    // The three cost groups print as subtractions; the two income ones do not.
    expect(matrix.groups.map((group) => group.negative)).toEqual([
      false,
      true,
      true,
      false,
      true,
    ]);
  });

  it("takes the three subtotals from the server rather than re-deriving them", () => {
    const matrix = profitLossMatrix(PROFIT_LOSS, LINES, "");

    expect(matrix.grossProfit.total).toBe("18000000.0000");
    expect(matrix.operatingProfit.total).toBe("10000000.0000");
    expect(matrix.netProfit.total).toBe("10600000.0000");
  });

  it("keeps the consolidated column equal to the columns beside it", () => {
    const matrix = profitLossMatrix(PROFIT_LOSS, LINES, "");

    for (const group of matrix.groups) {
      expect(group.total).toBe(sum(group.cells));
    }
  });

  /** A chart grown for years would otherwise print forty empty rows. */
  it("drops an account that did not move, but keeps its group", () => {
    const matrix = profitLossMatrix(PROFIT_LOSS, LINES, "");
    const revenue = matrix.groups[0];

    expect(revenue.accounts.map((a) => a.code)).toEqual(["4101", "4191"]);
    expect(revenue.accounts.map((a) => a.code)).not.toContain("4102");
  });

  /**
   * THE MATRIX'S LEAST OBVIOUS BEHAVIOUR. Narrowing to one lini shows the same
   * accounts with one column, not a shorter list of accounts.
   */
  it("drops COLUMNS rather than rows when one lini is chosen", () => {
    const all = profitLossMatrix(PROFIT_LOSS, LINES, "");
    const one = profitLossMatrix(PROFIT_LOSS, LINES, GROOMING);

    expect(all.columns.map((c) => c.label)).toEqual([
      "Grooming",
      "Retail",
      SHARED,
    ]);
    expect(one.columns.map((c) => c.label)).toEqual(["Grooming"]);
    // Same rows, narrower figures.
    expect(one.groups[0].total).toBe("23000000.0000");
  });

  /**
   * The consolidated total is re-summed from the VISIBLE cells, so a filtered
   * matrix does not show one column of Grooming beside a total that quietly
   * included retail.
   */
  it("narrows the consolidated total to the columns on screen", () => {
    const one = profitLossMatrix(PROFIT_LOSS, LINES, GROOMING);

    expect(one.netProfit.total).toBe("13000000.0000");
  });
});

describe("cashflowReport", () => {
  it("takes the period's movement as the difference between two reads", () => {
    const report = cashflowReport(CASH_OPENING, CASH_CLOSING);
    const kas = report.rows.find((row) => row.code === "1101")!;

    expect(kas.saldoAwal).toBe("10000000.0000");
    // 18.000.000 debit at the end − 10.000.000 at the start.
    expect(kas.inflow).toBe("8000000.0000");
    expect(kas.outflow).toBe("3000000.0000");
  });

  it("derives saldo akhir from the three columns beside it", () => {
    const report = cashflowReport(CASH_OPENING, CASH_CLOSING);

    for (const row of report.rows) {
      expect(row.saldoAkhir).toBe(
        minus(sum([row.saldoAwal, row.inflow]), row.outflow),
      );
    }
    expect(report.totals.saldoAkhir).toBe(
      minus(
        sum([report.totals.saldoAwal, report.totals.inflow]),
        report.totals.outflow,
      ),
    );
  });

  /** An account opened mid-period has no opening row at all — all movement. */
  it("handles an account that first posted during the period", () => {
    const report = cashflowReport(CASH_OPENING, CASH_CLOSING);
    const bca = report.rows.find((row) => row.code === "1102")!;

    expect(bca.saldoAwal).toBe("0.0000");
    expect(bca.inflow).toBe("5000000.0000");
  });

  it("drops an account with no opening balance and no movement", () => {
    const idle = balance("1109", "Kas Kecil", "cash_bank", "asset");
    const report = cashflowReport([idle], [idle]);

    expect(report.rows).toHaveLength(0);
  });

  it("shares out the closing balance to a hundred", () => {
    const report = cashflowReport(CASH_OPENING, CASH_CLOSING);
    const shares = report.rows.map((row) => row.share ?? 0);

    expect(sumNumbers(shares)).toBeGreaterThan(99);
    expect(sumNumbers(shares)).toBeLessThan(101);
  });
});

describe("balanceSheet", () => {
  it("files each account under its category's section", () => {
    const sheet = balanceSheet(TRIAL_BALANCE);

    expect(sheet.assets.groups.map((g) => g.key)).toEqual([
      "cash_bank",
      "persediaan",
    ]);
    expect(sheet.liabilities.groups.map((g) => g.key)).toEqual(["hutang_dagang"]);
    expect(sheet.equity.groups.map((g) => g.key)).toEqual(["modal"]);
  });

  /**
   * THE ONE FIGURE WITH NO ACCOUNT BEHIND IT. PawCRM has no closing entry, so
   * the retained earnings ARE the income and expense accounts summed to date.
   */
  it("derives laba ditahan from the income and expense accounts", () => {
    const sheet = balanceSheet(TRIAL_BALANCE);

    // 40.000.000 penjualan − 30.000.000 HPP
    expect(sheet.retainedEarnings).toBe("10000000.0000");
    expect(sheet.equityTotal).toBe("40000000.0000");
  });

  it("balances, and says so", () => {
    const sheet = balanceSheet(TRIAL_BALANCE);

    expect(sheet.assets.total).toBe("55000000.0000");
    expect(sheet.liabilitiesAndEquity).toBe("55000000.0000");
    expect(sheet.difference).toBe("0.0000");
    expect(sheet.balanced).toBe(true);
  });

  /**
   * A one-sided posting is the case this catches. Reported rather than hidden:
   * a balance sheet that silently does not add up is the most misleading thing
   * this module could show.
   */
  it("reports a sheet that does not balance rather than hiding it", () => {
    const sheet = balanceSheet(
      TRIAL_BALANCE.filter((row) => row.code !== "2101"),
    );

    expect(sheet.balanced).toBe(false);
    expect(sheet.difference).toBe("15000000.0000");
  });

  it("drops a section's empty categories but keeps the section", () => {
    const sheet = balanceSheet(TRIAL_BALANCE);

    expect(sheet.assets.groups.map((g) => g.key)).not.toContain("aset_tetap");
  });
});

/* ------------------------------------------------------------- the screens */

describe("ProfitLossScreen", () => {
  it("no longer warns that the figures are examples", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");

    expect(
      screen.queryByText("Angka di halaman ini masih contoh."),
    ).not.toBeInTheDocument();
  });

  /**
   * The lini bisnis filter drops COLUMNS from a matrix that still totals across
   * all of them, so sending it to the API — where it narrows the ledger — would
   * make the consolidated column mean something else.
   */
  it("asks the API for the period and the branch, never for a business line", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");

    expect(journalEntryService.profitLoss).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2026-08-01", dateTo: "2026-08-31" }),
    );
    expect(journalEntryService.profitLoss).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessLineId: expect.anything() }),
    );
  });

  it("opens on pendapatan and folds the rest away", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");

    expect(screen.getByRole("button", { name: /Pendapatan$/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Both probed by CODE rather than by name. Since the accounts took BO's own
    // wording, an account name and its group's heading can be the same string —
    // "Harga Pokok Penjualan" is both — and only the account row folds away.
    expect(screen.getByText("4101")).toBeInTheDocument();
    expect(screen.queryByText("5101")).not.toBeInTheDocument();
  });

  it("prints both subtotals under the groups they close", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");

    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    const hpp = rows.findIndex((text) => text.startsWith("Harga Pokok"));
    const kotor = rows.findIndex((text) => text.startsWith("Laba Kotor"));
    const biaya = rows.findIndex((text) => text.startsWith("Biaya"));
    const usaha = rows.findIndex((text) => text.startsWith("Laba Usaha"));

    expect(kotor).toBe(hpp + 1);
    expect(usaha).toBe(biaya + 1);
  });

  it("prints beban as a subtraction though it is stored positive", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");
    await userEvent.click(
      screen.getByRole("button", { name: "Buka semua rincian" }),
    );

    const row = screen.getByText("Beban Sewa").closest("tr");
    // A true minus sign, not the hyphen formatMoney would put after "Rp".
    expect(row).toHaveTextContent("−Rp 8.000.000");
  });

  it("drops a lini's column when the filter picks another", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await screen.findByText("Laporan Laba Rugi");

    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toContain(SHARED);

    await userEvent.click(screen.getByLabelText("Filter lini bisnis"));
    await userEvent.click(screen.getByRole("option", { name: "Grooming" }));

    await waitFor(() =>
      expect(
        screen.getAllByRole("columnheader").map((cell) => cell.textContent),
      ).toEqual(["Akun", "Grooming", "Total Konsolidasi"]),
    );
  });
});

describe("CashflowScreen", () => {
  beforeEach(() => {
    asMock(journalEntryService.balances).mockImplementation(async (query) =>
      query?.asOf === "2026-07-31"
        ? { asOf: "2026-07-31", timezone: "Asia/Jakarta", accounts: CASH_OPENING }
        : { asOf: "2026-08-31", timezone: "Asia/Jakarta", accounts: CASH_CLOSING },
    );
  });

  /**
   * `balances` is INCLUSIVE of `asOf`, so reading the first day of the period
   * would fold that day's own movement into the opening balance.
   */
  it("reads the opening balance as of the day BEFORE the period", async () => {
    renderWithAuth(<CashflowScreen now={NOW} />);
    await screen.findByText("Ringkasan Arus Kas");

    expect(journalEntryService.balances).toHaveBeenCalledWith(
      expect.objectContaining({
        asOf: "2026-07-31",
        accountCategory: "cash_bank",
      }),
    );
  });

  it("prints the identity it uses, and no longer says the figures are examples", async () => {
    renderWithAuth(<CashflowScreen now={NOW} />);
    await screen.findByText("Ringkasan Arus Kas");

    expect(
      screen.getByText("Saldo Akhir = Saldo Awal + Masuk − Keluar"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Angka di halaman ini masih contoh."),
    ).not.toBeInTheDocument();
  });

  /**
   * A rupiah in the bank belongs to the shop, not to grooming — so the control
   * is ABSENT rather than disabled, and this is the assertion that keeps it so.
   */
  it("offers no lini bisnis filter", async () => {
    renderWithAuth(<CashflowScreen now={NOW} />);
    await screen.findByText("Ringkasan Arus Kas");

    expect(screen.getByLabelText("Filter cabang")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Filter lini bisnis"),
    ).not.toBeInTheDocument();
  });
});

describe("BalanceSheetScreen", () => {
  it("reads the whole trial balance as of the end of the period", async () => {
    renderWithAuth(<BalanceSheetScreen now={NOW} />);
    await screen.findByText("Laporan Neraca");

    expect(journalEntryService.balances).toHaveBeenCalledWith(
      expect.objectContaining({ asOf: "2026-08-31" }),
    );
    // Unfiltered: laba ditahan is derived from the income and expense rows, so
    // a category filter would take the equity side away with them.
    expect(journalEntryService.balances).not.toHaveBeenCalledWith(
      expect.objectContaining({ accountCategory: expect.anything() }),
    );
  });

  it("shows the two totals a reader checks against each other", async () => {
    renderWithAuth(<BalanceSheetScreen now={NOW} />);
    const table = within(await screen.findByRole("table"));

    expect(table.getByText("Total Aset").closest("tr")).toHaveTextContent(
      "Rp 55.000.000",
    );
    expect(
      table.getByText("Total Kewajiban + Modal").closest("tr"),
    ).toHaveTextContent("Rp 55.000.000");
  });

  it("shows laba ditahan as a derived row and says it is not an account", async () => {
    renderWithAuth(<BalanceSheetScreen now={NOW} />);
    const table = within(await screen.findByRole("table"));

    expect(table.getByText("Laba Ditahan").closest("tr")).toHaveTextContent(
      "Rp 10.000.000",
    );
    expect(table.getByText(/dihitung, bukan akun/)).toBeInTheDocument();
  });

  it("warns when the two sides do not agree", async () => {
    asMock(journalEntryService.balances).mockResolvedValue({
      asOf: "2026-08-31",
      timezone: "Asia/Jakarta",
      accounts: TRIAL_BALANCE.filter((row) => row.code !== "2101"),
    });

    renderWithAuth(<BalanceSheetScreen now={NOW} />);

    expect(
      await screen.findByText("Neraca belum seimbang."),
    ).toBeInTheDocument();
  });

  it("offers no lini bisnis filter", async () => {
    renderWithAuth(<BalanceSheetScreen now={NOW} />);
    await screen.findByText("Laporan Neraca");

    expect(
      screen.queryByLabelText("Filter lini bisnis"),
    ).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ helpers */

/**
 * Decimal-string arithmetic, done the long way ON PURPOSE.
 *
 * The obvious move is to import the helper the code under test folds with —
 * which would make a bug in it cancel itself out and the assertions pass on
 * wrong numbers. These go through `Number` instead: imprecise in general, exact
 * at the magnitudes used here, and independent of the implementation.
 */
function toMinor(value: string): number {
  return Math.round(Number(value) * 10000);
}

function fromMinor(value: number): string {
  return (value / 10000).toFixed(4);
}

function sum(values: string[]): string {
  return fromMinor(values.reduce((acc, value) => acc + toMinor(value), 0));
}

function minus(a: string, b: string): string {
  return fromMinor(toMinor(a) - toMinor(b));
}

function sumNumbers(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
