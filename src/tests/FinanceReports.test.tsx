import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { CashflowScreen, ProfitLossScreen } from "@/features/accounting";
import { cashflowReport, profitLossMatrix } from "@/features/accounting";

/**
 * Mount tests for Laba Rugi and Arus Kas.
 *
 * NO SERVICES ARE STUBBED, because neither screen calls one: both render the
 * fixture in features/accounting/data/reportFixtures.ts. That is the whole point
 * of the tests below — they pin the parts of these screens that will STILL be
 * true when the fixture is swapped for an endpoint, and nothing that only holds
 * while it is a fixture.
 *
 * WHAT IS WORTH ASSERTING HERE, given the numbers are contoh:
 *
 *   - the arithmetic holds together (laba kotor is pendapatan − HPP, saldo akhir
 *     is its own three columns), because that is the report's contract and it is
 *     the one thing a reader cannot check for themselves;
 *   - narrowing to one lini leaves one column, not one row — the matrix's least
 *     obvious behaviour and the easiest to regress;
 *   - the beban groups print as subtractions even though they are stored
 *     positive, which is where a sign bug would hide;
 *   - both pages admit the figures are contoh, because a report that does not is
 *     a report somebody quotes at a bank.
 *
 * A FIXED `now` is passed to both. The screens take one so the date presets do
 * not read the clock; a test that let them would fail on a month boundary.
 */

const NOW = "2026-08-17T03:00:00.000Z";

/** Everything is one lini's column, so the labels are worth naming once. */
const GROOMING = "Grooming";
const SHARED = "Bersama (HQ)";

describe("profitLossMatrix", () => {
  it("subtracts the beban groups rather than adding them", () => {
    const matrix = profitLossMatrix({ branchId: "", businessLineId: "" });
    const [revenue, cogs, opex] = matrix.groups;

    // Every group total is stated positive — the sign is the report's, not the
    // data's — so laba kotor is a subtraction and not a sum.
    expect(revenue.total.startsWith("-")).toBe(false);
    expect(cogs.total.startsWith("-")).toBe(false);
    expect(matrix.grossProfit.total).toBe(
      minus(revenue.total, cogs.total),
    );
    expect(matrix.netProfit.total).toBe(
      minus(matrix.grossProfit.total, opex.total),
    );
  });

  it("keeps the consolidated column equal to the columns beside it", () => {
    const matrix = profitLossMatrix({ branchId: "", businessLineId: "" });

    for (const group of matrix.groups) {
      expect(group.total).toBe(sum(group.cells));
    }
    expect(matrix.netProfit.total).toBe(sum(matrix.netProfit.cells));
  });

  /**
   * The matrix's least obvious behaviour: narrowing to a lini drops a COLUMN and
   * keeps every account row, so the same chart is read one column at a time.
   */
  it("narrows to one column without dropping the accounts", () => {
    const all = profitLossMatrix({ branchId: "", businessLineId: "" });
    const grooming = profitLossMatrix({
      branchId: "",
      businessLineId: "lini-grooming",
    });

    expect(all.columns).toHaveLength(4);
    expect(grooming.columns).toEqual([
      { id: "lini-grooming", label: GROOMING },
    ]);
    // Grooming buys no retail stock, so its HPP has fewer rows than the shop's —
    // an account is dropped for having no amount in the visible columns, which
    // is not the same as being filtered out for belonging to another lini.
    expect(
      grooming.groups.find((group) => group.key === "revenue")?.accounts,
    ).toHaveLength(1);
  });

  it("puts the unattributed bucket last and never hides it", () => {
    const matrix = profitLossMatrix({ branchId: "", businessLineId: "" });

    // Sewa, gaji kantor and listrik land here; a matrix without the column would
    // show three profitable lines and no rent.
    expect(matrix.columns.at(-1)).toEqual({ id: null, label: SHARED });
  });

  it("narrows by cabang", () => {
    const all = profitLossMatrix({ branchId: "", businessLineId: "" });
    const one = profitLossMatrix({
      branchId: "cabang-kemang",
      businessLineId: "",
    });

    expect(toMinor(one.revenue.total)).toBeLessThan(
      toMinor(all.revenue.total),
    );
  });
});

describe("cashflowReport", () => {
  it("derives saldo akhir from the three columns beside it", () => {
    const report = cashflowReport("");

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

  /**
   * An account the branch does not hold is not a balance of zero — it is not
   * that branch's account, and a row of dashes would invite somebody to ask why
   * the bank account is empty.
   */
  it("drops an account the chosen cabang does not hold", () => {
    const all = cashflowReport("");
    const bintaro = cashflowReport("cabang-bintaro");

    expect(all.rows.map((row) => row.code)).toContain("1112");
    expect(bintaro.rows.map((row) => row.code)).not.toContain("1112");
  });

  it("shares out the closing balance to a hundred", () => {
    const report = cashflowReport("");
    const shares = report.rows.map((row) => row.share ?? 0);

    // One decimal each, so the sum lands within rounding of 100 rather than on
    // it. Anything further out means the base is wrong, not the rounding.
    expect(sumNumbers(shares)).toBeGreaterThan(99);
    expect(sumNumbers(shares)).toBeLessThan(101);
  });
});

describe("ProfitLossScreen", () => {
  it("says the figures are contoh before showing any of them", () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);

    expect(
      screen.getByText("Angka di halaman ini masih contoh."),
    ).toBeInTheDocument();
  });

  it("opens on pendapatan and folds the rest away", () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);

    // The three group headings are always there; only pendapatan's detail is.
    expect(screen.getByRole("button", { name: /Pendapatan/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Penjualan Produk")).toBeInTheDocument();
    expect(screen.queryByText("Harga Pokok Penjualan")).not.toBeInTheDocument();
  });

  it("opens every group from one button, then closes them again", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Buka semua rincian" }),
    );
    expect(screen.getByText("Harga Pokok Penjualan")).toBeInTheDocument();
    expect(screen.getByText("Beban Sewa")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tutup semua rincian" }),
    );
    expect(screen.queryByText("Beban Sewa")).not.toBeInTheDocument();
  });

  it("prints beban as a subtraction though it is stored positive", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Buka semua rincian" }),
    );

    const row = screen.getByText("Beban Sewa").closest("tr");
    // A true minus sign, not the hyphen formatMoney would put after "Rp".
    expect(row).toHaveTextContent("−Rp 24.000.000");
  });

  it("drops a lini's column when the filter picks another", async () => {
    renderWithAuth(<ProfitLossScreen now={NOW} />);

    const header = screen.getAllByRole("columnheader");
    expect(header.map((cell) => cell.textContent)).toContain(SHARED);

    await userEvent.click(screen.getByLabelText("Filter lini bisnis"));
    await userEvent.click(screen.getByRole("option", { name: GROOMING }));

    const narrowed = screen.getAllByRole("columnheader");
    expect(narrowed.map((cell) => cell.textContent)).toEqual([
      "Akun",
      GROOMING,
      "Total Konsolidasi",
    ]);
  });
});

describe("CashflowScreen", () => {
  it("says the figures are contoh, and prints the identity it uses", () => {
    renderWithAuth(<CashflowScreen now={NOW} />);

    expect(
      screen.getByText("Angka di halaman ini masih contoh."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Saldo Akhir = Saldo Awal + Masuk − Keluar"),
    ).toBeInTheDocument();
  });

  /**
   * A rupiah in the bank belongs to the shop, not to grooming — so the control
   * is ABSENT rather than disabled, and this is the assertion that keeps it so.
   */
  it("offers no lini bisnis filter", () => {
    renderWithAuth(<CashflowScreen now={NOW} />);

    expect(screen.getByLabelText("Filter cabang")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter lini bisnis")).not.toBeInTheDocument();
  });

  it("drops the account a cabang does not hold when it is picked", async () => {
    renderWithAuth(<CashflowScreen now={NOW} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Bank Mandiri")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Filter cabang"));
    await userEvent.click(
      screen.getByRole("option", { name: "Cabang Bintaro" }),
    );

    expect(within(screen.getByRole("table")).queryByText("Bank Mandiri")).toBe(
      null,
    );
  });
});

/* ------------------------------------------------------------------ helpers */

/**
 * Decimal-string arithmetic, done the long way ON PURPOSE.
 *
 * The obvious move is to import `sumDecimals` from utils/decimal — which is what
 * the code under test folds with, so a bug in it would cancel itself out and the
 * assertions would pass on wrong numbers. These go through `Number` instead:
 * imprecise in general, exact at the magnitudes this fixture uses, and
 * independent of the implementation.
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
