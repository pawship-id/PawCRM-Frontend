import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { FinanceDashboardScreen } from "@/features/accounting";
import {
  changePct,
  currentMonthRange,
  formatPercent,
  largestExpenses,
  lineProfits,
  marginPct,
  previousMonthRange,
  previousPeriod,
  profitLossHeadline,
  trendWindow,
} from "@/features/accounting/financeSummary";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { fixedCostService } from "@/services/fixedCost.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { ApiError } from "@/services/api-error";

jest.mock("@/services/journalEntry.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/purchaseInvoice.service");
jest.mock("@/services/fixedCost.service");

/**
 * The Keuangan Ringkasan tab (v3 mockup, 22 September 2026), and the pure
 * module behind it.
 *
 * WHAT IS WORTH ASSERTING: not a figure the demo data happens to produce, but
 * the contract between this screen and the modules it reads —
 *
 *   - every P&L figure is read off ONE laba rugi, and the browser only divides
 *     and labels it;
 *   - each read is made with the part of the filter it depends on;
 *   - a failed read says so rather than showing zeroes, and a failure in one
 *     module does not blank the others;
 *   - a card whose grant is missing is ABSENT, which must not look like a card
 *     whose request failed.
 */

const NOW = "2026-08-16T04:00:00.000Z";
const GROOMING = "bl-grooming";
const RETAIL = "bl-retail";

const cells = (grooming: string, retail: string, shared: string) => [
  { businessLineId: GROOMING, amount: grooming },
  { businessLineId: RETAIL, amount: retail },
  { businessLineId: null, amount: shared },
];

const account = (
  accountId: string,
  code: string,
  name: string,
  accountCategory: string,
  accountType: string,
  lines: ReturnType<typeof cells>,
  total: string,
) => ({ accountId, code, name, accountCategory, accountType, lines, total });

/**
 * Grooming sells 60 jt with 2 jt of discount; Retail sells 47,85 jt. Shared
 * rent and payroll sit in the unattributed column. Every total below is the
 * sum of its cells, as the server derives it.
 */
const PROFIT_LOSS = {
  period: { dateFrom: null, dateTo: null, timezone: "Asia/Jakarta" },
  accounts: [
    account("a-4101", "4101", "Penjualan Barang", "pendapatan", "income",
      cells("0", "47850000.0000", "0"), "47850000.0000"),
    account("a-4102", "4102", "Penjualan Jasa", "pendapatan", "income",
      cells("60000000.0000", "0", "0"), "60000000.0000"),
    // A contra account: debit balance, negative in its normal direction.
    account("a-4191", "4191", "Diskon Penjualan", "pendapatan", "income",
      cells("-2000000.0000", "0", "0"), "-2000000.0000"),
    account("a-5101", "5101", "HPP", "hpp", "expense",
      cells("5000000.0000", "30000000.0000", "0"), "35000000.0000"),
    account("a-6101", "6101", "Beban Gaji", "biaya", "expense",
      cells("20000000.0000", "0", "12000000.0000"), "32000000.0000"),
    account("a-6102", "6102", "Beban Sewa", "biaya", "expense",
      cells("0", "0", "8000000.0000"), "8000000.0000"),
    account("a-6103", "6103", "Beban Listrik", "biaya", "expense",
      cells("0", "2000000.0000", "0"), "2000000.0000"),
  ],
  categories: [
    { accountCategory: "pendapatan", lines: cells("58000000.0000", "47850000.0000", "0"), total: "105850000.0000" },
    { accountCategory: "hpp", lines: cells("5000000.0000", "30000000.0000", "0"), total: "35000000.0000" },
    { accountCategory: "biaya", lines: cells("20000000.0000", "2000000.0000", "20000000.0000"), total: "42000000.0000" },
    { accountCategory: "pendapatan_lainnya", lines: cells("0", "0", "0"), total: "0.0000" },
    { accountCategory: "biaya_lainnya", lines: cells("0", "0", "0"), total: "0.0000" },
  ],
  results: {
    grossProfit: { lines: cells("53000000.0000", "17850000.0000", "0"), total: "70850000.0000" },
    operatingProfit: { lines: cells("33000000.0000", "15850000.0000", "-20000000.0000"), total: "28850000.0000" },
    netProfit: { lines: cells("33000000.0000", "15850000.0000", "-20000000.0000"), total: "28850000.0000" },
  },
};

const day = (date: string, grooming: string, retail: string) => ({
  date,
  revenue: "0",
  expense: "0",
  netProfit: "0",
  byBusinessLine: [
    ...(grooming !== "0" ? [{ businessLineId: GROOMING, revenue: grooming, expense: "0", net: grooming }] : []),
    ...(retail !== "0" ? [{ businessLineId: RETAIL, revenue: retail, expense: "0", net: retail }] : []),
  ],
});

const TREND_DAYS_FIXTURE = [
  day("2026-08-10", "2000000.0000", "1000000.0000"),
  day("2026-08-11", "0", "0"),
  day("2026-08-12", "1500000.0000", "0"),
  day("2026-08-13", "1200000.0000", "900000.0000"),
  day("2026-08-14", "1600000.0000", "1000000.0000"),
  day("2026-08-15", "2400000.0000", "1000000.0000"),
  day("2026-08-16", "1900000.0000", "1000000.0000"),
];

/** Laba bersih — on the card and again in the P&L panel. */
const NET_PROFIT = "Rp 28.850.000";

/** The ledger has answered and the page has drawn it. */
async function loaded() {
  await screen.findAllByText(NET_PROFIT);
}

beforeEach(() => {
  (journalEntryService.profitLoss as jest.Mock).mockResolvedValue(PROFIT_LOSS);
  (journalEntryService.trend as jest.Mock).mockResolvedValue({
    period: { dateFrom: "2026-08-10", dateTo: "2026-08-16", timezone: "Asia/Jakarta" },
    days: TREND_DAYS_FIXTURE,
  });
  (cashTransactionService.list as jest.Mock).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 42, totalPages: 42 },
    totals: {
      in: { amount: "62400000.0000", count: 28 },
      out: { amount: "38100000.0000", count: 14 },
    },
  });
  (customerInvoiceService.outstanding as jest.Mock).mockResolvedValue({
    items: [],
    totalOutstanding: "14200000.0000",
    totalInvoices: 6,
    totalOverdueOutstanding: "4100000.0000",
    totalOverdueInvoices: 2,
    totalDueSoonOutstanding: "0.0000",
    totalDueSoonInvoices: 0,
    horizonDays: 7,
    collectedThisMonth: { amount: "0.0000", paymentCount: 0, from: "2026-08-01", to: "2026-08-31" },
  });
  (purchaseInvoiceService.outstandingSummary as jest.Mock).mockResolvedValue({
    items: [],
    totalOutstanding: "8600000.0000",
    totalInvoices: 3,
    totalOverdueOutstanding: "0.0000",
    totalOverdueInvoices: 0,
    totalDueSoonOutstanding: "0.0000",
    totalDueSoonInvoices: 0,
    horizonDays: 7,
  });
  (fixedCostService.list as jest.Mock).mockResolvedValue({
    items: [{ _id: "fc-1", name: "Sewa ruko", nextDueAt: "2026-08-20T00:00:00.000Z" }],
    pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
    totals: {
      in: { amount: "0.0000", count: 0 },
      out: { amount: "11500000.0000", count: 2 },
    },
  });
  (branchService.list as jest.Mock).mockResolvedValue({
    items: [{ _id: "branch-kemang", name: "Cabang Kemang" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  (businessLineService.list as jest.Mock).mockResolvedValue({
    items: [
      { _id: GROOMING, name: "Grooming", color: "#0D9488" },
      { _id: RETAIL, name: "Retail", color: "#B45309" },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

describe("financeSummary", () => {
  it("returns null rather than a margin against zero revenue", () => {
    expect(marginPct("-22570000.0000", "0.0000")).toBeNull();
    expect(formatPercent(null)).toBe("—");
  });

  it("computes a margin without dividing money in floating point", () => {
    expect(marginPct("19070000.0000", "110750000.0000")).toBe(17.2);
  });

  /**
   * NOT THE MOCKUP'S FLAT 11%. The contra accounts inside pendapatan are the
   * deductions, exactly; the accounts that grew are the gross.
   */
  it("reads gross revenue and its deductions off the contra accounts", () => {
    const headline = profitLossHeadline(PROFIT_LOSS as never);

    expect(headline.grossRevenue).toBe("107850000.0000");
    expect(headline.deductions).toBe("2000000.0000");
    expect(headline.netRevenue).toBe("105850000.0000");
    expect(headline.netProfit).toBe("28850000.0000");
    expect(headline.marginPct).toBe(27.2);
    expect(headline.otherNet).toBe("0.0000");
  });

  /**
   * Each row reads across: pendapatan − HPP − biaya = laba bersih. The shared
   * bucket sold nothing, so it has no margin and sorts after every line that
   * does.
   */
  it("ranks the lini thinnest first, with the shared bucket last", () => {
    const rows = lineProfits(
      PROFIT_LOSS as never,
      new Map([[GROOMING, "Grooming"], [RETAIL, "Retail"]]),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Retail",
      "Grooming",
      "Bersama (HQ)",
    ]);
    expect(rows[0]).toMatchObject({
      revenue: "47850000.0000",
      hpp: "30000000.0000",
      cost: "2000000.0000",
      net: "15850000.0000",
      marginPct: 33.1,
    });
    expect(rows[2].marginPct).toBeNull();
  });

  it("ranks the running costs, leaving HPP out", () => {
    const top = largestExpenses(PROFIT_LOSS as never);

    expect(top.map((item) => item.code)).toEqual(["6101", "6102", "6103"]);
    expect(top[0].sharePct).toBe(76.1);
  });

  it("builds its month presets from the server's clock", () => {
    expect(currentMonthRange(new Date(NOW))).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    expect(previousMonthRange(new Date(NOW))).toEqual({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });
  });

  it("rolls the year back on the January boundary", () => {
    expect(previousMonthRange(new Date("2026-01-09T00:00:00Z"))).toEqual({
      dateFrom: "2025-12-01",
      dateTo: "2025-12-31",
    });
  });

  /**
   * A whole month compares to the whole month before it — "Bulan ini" in
   * September against 2–31 August would quietly drop the 1st.
   */
  it("compares a whole month with the whole month before it", () => {
    expect(previousPeriod("2026-09-01", "2026-09-30")).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    expect(previousPeriod("2026-01-01", "2026-01-31")).toEqual({
      dateFrom: "2025-12-01",
      dateTo: "2025-12-31",
    });
  });

  it("repeats any other range's length immediately before it", () => {
    expect(previousPeriod("2026-08-10", "2026-08-16")).toEqual({
      dateFrom: "2026-08-03",
      dateTo: "2026-08-09",
    });
    expect(previousPeriod("2026-03-01", "2026-03-01")).toEqual({
      dateFrom: "2026-02-28",
      dateTo: "2026-02-28",
    });
  });

  it("has no previous period for Semua or a range open at one end", () => {
    expect(previousPeriod("", "")).toBeNull();
    expect(previousPeriod("2026-08-01", "")).toBeNull();
    expect(previousPeriod("", "2026-08-31")).toBeNull();
  });

  /** Relative to the SIZE of before, so a shrinking loss reads as progress. */
  it("measures change against the size of the previous figure", () => {
    expect(changePct("28850000", "25000000")).toBe(15.4);
    expect(changePct("-5000000", "-10000000")).toBe(50);
    // Growth from nothing is not a percentage.
    expect(changePct("1000", "0")).toBeNull();
  });

  it("counts the trend window inclusively, ending today", () => {
    expect(trendWindow(new Date(NOW))).toEqual({
      dateFrom: "2026-08-10",
      dateTo: "2026-08-16",
    });
  });
});

/**
 * Pick an arbitrary range: press the Custom pill, fill the two inputs it
 * reveals, then Terapkan.
 *
 * `fireEvent.change` rather than `userEvent.type` — jsdom's `<input type=date>`
 * has no text-entry behaviour to drive, and typing into one sets nothing.
 */
async function pickCustomRange(from: string, to: string) {
  await userEvent.click(screen.getByRole("button", { name: "Custom" }));

  fireEvent.change(await screen.findByLabelText("Periode khusus dari"), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText("Periode khusus sampai"), {
    target: { value: to },
  });

  await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));
}

describe("FinanceDashboardScreen", () => {
  /**
   * The screen opens unfiltered, like every other date filter in the product.
   * A default of "this month" made an empty August read as an empty ledger on a
   * tenant whose books start in June.
   */
  it("asks the ledger for every period until somebody picks one", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      ),
    );
  });

  /**
   * A PILL APPLIES ON CLICK — no Terapkan, which is what §8 asks of a pill row
   * and what makes it worth the space over a dropdown.
   */
  it("sends the period a pill applied", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
        }),
      ),
    );

    // The pill itself carries the state, so there is nothing for a chip to pay
    // back — it conceals nothing. Pressed is the whole answer.
    expect(screen.getByRole("button", { name: "Bulan ini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /Hapus filter Periode/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * The mirror of the above, and the reason the chip rule is worth a test of its
   * own: a range that matches no pill is the ONE period the bar cannot show in
   * full, so it is the one that gets a chip and a way off.
   */
  it("chips a custom range, which no pill can show", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await pickCustomRange("2026-07-01", "2026-07-31");

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
        }),
      ),
    );

    expect(
      await screen.findByRole("button", {
        name: /Hapus filter Periode 1 Jul–31 Jul/,
      }),
    ).toBeInTheDocument();
    // And no pill claims it, because none of them is that month.
    expect(screen.getByRole("button", { name: "Semua" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  /**
   * PRESSING CUSTOM ASKS A QUESTION; it does not answer one. Re-querying on the
   * press would move every figure on the page for a choice nobody has finished
   * making — and again on the first of the two dates.
   */
  it("opens the two inputs without touching the query", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    const before = (journalEntryService.profitLoss as jest.Mock).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(
      await screen.findByLabelText("Periode khusus dari"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Periode khusus sampai")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Periode khusus dari"), {
      target: { value: "2026-07-01" },
    });

    expect((journalEntryService.profitLoss as jest.Mock).mock.calls).toHaveLength(
      before,
    );
  });

  /**
   * RESET DOES NOT WAIT FOR TERAPKAN (§8). It clears and re-queries in the same
   * click, which is what makes it safe to reach for.
   */
  it("clears an applied range in one click", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await pickCustomRange("2026-07-01", "2026-07-31");
    await screen.findByRole("button", { name: /Hapus filter Periode/ });

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      ),
    );
    expect(screen.getByRole("button", { name: "Semua" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // The inputs are the pill's disclosure, so picking any other period puts them
  // away — leaving them open would offer a range the pill above contradicts.
  it("closes the inputs when another pill answers instead", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await screen.findByLabelText("Periode khusus dari");

    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText("Periode khusus dari"),
      ).not.toBeInTheDocument(),
    );
  });

  /**
   * THE STATE THESE SCREENS OPEN IN HAS TO BE REACHABLE. They start unfiltered
   * on purpose, so "Semua" is a pill rather than something you get back to by
   * clearing a chip.
   */
  it("gets back to every period from the pill row", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Hari ini" }));
    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: "2026-08-16" }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Semua" }));
    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      ),
    );
  });

  /* ---------------------------------------------------------- the figures */

  it("renders the figures the APIs returned, not a re-derivation", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    // Net revenue and its gross, from the laba rugi.
    expect(screen.getAllByText("Rp 105.850.000").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Kotor Rp 107.850.000 − diskon & retur Rp 2.000.000"),
    ).toBeInTheDocument();
    // Margin, on its own card and under the laba bersih.
    expect(screen.getByText("27,2%")).toBeInTheDocument();
    expect(screen.getByText("Margin 27,2% dari net revenue")).toBeInTheDocument();
    // Piutang and utang, each from its module's outstanding aggregate.
    expect(screen.getByText("Rp 14.200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 8.600.000")).toBeInTheDocument();
  });

  /** Masuk − keluar, exact: two server-side aggregates, never a sum over rows. */
  it("derives net cashflow from masuk minus keluar", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Rp 24.300.000")).toBeInTheDocument();
    expect(
      screen.getByText("Masuk Rp 62.400.000 − keluar Rp 38.100.000"),
    ).toBeInTheDocument();
  });

  /**
   * The v3 mockup moved saldo, masuk/keluar and komisi to their own tabs. A
   * landing page repeating them is a second, staler answer one tab along.
   */
  it("no longer carries the cash cards", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(screen.queryByText(/Saldo kas & bank/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Komisi belum dibayar/i)).not.toBeInTheDocument();
    expect(journalEntryService.balances).not.toHaveBeenCalled();
    expect(journalEntryService.summary).not.toHaveBeenCalled();
  });

  /**
   * A period with no sales still has a net profit arithmetically — an inventory
   * surplus makes expense negative. Painting that green claims a profit nobody
   * earned.
   */
  it("does not claim a profit when there was no revenue", async () => {
    (journalEntryService.profitLoss as jest.Mock).mockResolvedValue({
      ...PROFIT_LOSS,
      accounts: [],
      categories: PROFIT_LOSS.categories.map((row) => ({
        ...row,
        lines: [],
        total: row.accountCategory === "hpp" ? "-1105100.0000" : "0.0000",
      })),
      results: {
        grossProfit: { lines: [], total: "1105100.0000" },
        operatingProfit: { lines: [], total: "1105100.0000" },
        netProfit: { lines: [], total: "1105100.0000" },
      },
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    const [card] = await screen.findAllByText("Rp 1.105.100");
    expect(card).not.toHaveClass("text-success");
    expect(
      screen.getByText("Belum ada pendapatan di periode ini"),
    ).toBeInTheDocument();
  });

  it("still colours a real profit", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    const [card] = await screen.findAllByText(NET_PROFIT);
    expect(card).toHaveClass("text-success");
  });

  /* ------------------------------------------------ vs periode sebelumnya */

  /** "Semua" has no before, so no card claims a change — and no request is made. */
  it("shows no delta on Semua, and says how to get one", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(screen.queryByText(/vs periode sebelumnya/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Pilih periode untuk membandingkan/),
    ).toBeInTheDocument();
    expect(journalEntryService.profitLoss).toHaveBeenCalledTimes(1);
  });

  it("compares each money card with the period before", async () => {
    const PREVIOUS = {
      ...PROFIT_LOSS,
      accounts: [
        account("a-4102", "4102", "Penjualan Jasa", "pendapatan", "income",
          cells("100000000.0000", "0", "0"), "100000000.0000"),
      ],
      categories: PROFIT_LOSS.categories.map((row) =>
        row.accountCategory === "pendapatan"
          ? { ...row, total: "100000000.0000" }
          : row,
      ),
      results: {
        ...PROFIT_LOSS.results,
        netProfit: { lines: [], total: "25000000.0000" },
      },
    };
    (journalEntryService.profitLoss as jest.Mock).mockImplementation(
      (query: { dateFrom?: string }) =>
        Promise.resolve(query.dateFrom === "2026-07-01" ? PREVIOUS : PROFIT_LOSS),
    );
    (cashTransactionService.list as jest.Mock).mockImplementation(
      (query: { dateFrom?: string }) =>
        Promise.resolve({
          items: [],
          pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
          totals:
            query.dateFrom === "2026-07-01"
              ? {
                  in: { amount: "50000000.0000", count: 1 },
                  out: { amount: "30000000.0000", count: 1 },
                }
              : {
                  in: { amount: "62400000.0000", count: 28 },
                  out: { amount: "38100000.0000", count: 14 },
                },
        }),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    // August is compared with July — the whole month, not the 31 days before.
    expect(
      await screen.findByText("Dibandingkan dengan 01 Jul 2026 – 31 Jul 2026."),
    ).toBeInTheDocument();
    expect(journalEntryService.profitLoss).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2026-07-01", dateTo: "2026-07-31" }),
    );

    // Laba 25 → 28,85 jt; revenue 100 → 105,85 jt; cash 20 → 24,3 jt.
    expect(
      await screen.findByText("+15,4% vs periode sebelumnya"),
    ).toBeInTheDocument();
    expect(screen.getByText("+5,8% vs periode sebelumnya")).toBeInTheDocument();
    expect(screen.getByText("+21,5% vs periode sebelumnya")).toBeInTheDocument();
    // Margin 25,0% → 27,2% is +2,2 POIN, not a percentage change.
    expect(screen.getByText("+2,2 poin vs periode sebelumnya")).toBeInTheDocument();
  });

  /** A delta is a caption: if the before cannot be read, the card still stands. */
  it("drops the delta, not the card, when the previous period fails", async () => {
    (journalEntryService.profitLoss as jest.Mock).mockImplementation(
      (query: { dateFrom?: string }) =>
        query.dateFrom === "2026-07-01"
          ? Promise.reject(new ApiError("Server sedang bermasalah", 500))
          : Promise.resolve(PROFIT_LOSS),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    await screen.findByText(/Dibandingkan dengan 01 Jul 2026/);
    expect(screen.getAllByText(NET_PROFIT).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Ringkasan keuangan gagal dimuat/),
    ).not.toBeInTheDocument();
    // Only net cashflow, whose own read succeeded, keeps a delta.
    await waitFor(() =>
      expect(screen.getAllByText(/vs periode sebelumnya/)).toHaveLength(1),
    );
  });

  /* ---------------------------------------------------------------- lini */

  it("names the lini with the thinnest margin", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText("Retail marginnya paling tipis"),
    ).toBeInTheDocument();
    expect(screen.getByText(/terendah dari 2 lini bisnis/)).toBeInTheDocument();
  });

  it("tables each lini, thinnest first, with the word beside the margin", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    const table = screen
      .getByText("Laba per lini bisnis")
      .closest("[data-slot=card]") as HTMLElement;
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("Retail");
    expect(rows[0]).toHaveTextContent("Sehat 33,1%");
    expect(rows[1]).toHaveTextContent("Grooming");
    // The shared bucket has costs and no revenue — a margin would be meaningless.
    expect(rows[2]).toHaveTextContent("Bersama (HQ)");
    expect(rows[2]).toHaveTextContent("Belum dibagi ke lini");
    expect(rows[2]).toHaveTextContent("−Rp 20.000.000");
  });

  it("says so when the tenant has no lini at all", async () => {
    (businessLineService.list as jest.Mock).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    (journalEntryService.profitLoss as jest.Mock).mockResolvedValue({
      ...PROFIT_LOSS,
      results: {
        ...PROFIT_LOSS.results,
        netProfit: {
          lines: [{ businessLineId: null, amount: "28850000.0000" }],
          total: "28850000.0000",
        },
      },
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Belum ada lini bisnis")).toBeInTheDocument();
    expect(screen.queryByText("Laba per lini bisnis")).not.toBeInTheDocument();
  });

  /* --------------------------------------------------------------- P&L */

  it("reads the P&L down to laba bersih, and lists the largest costs", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(screen.getByText("Laba kotor")).toBeInTheDocument();
    expect(screen.getByText("Rp 70.850.000")).toBeInTheDocument();
    expect(screen.getByText("Biaya operasional")).toBeInTheDocument();
    expect(screen.getByText("Rp 42.000.000")).toBeInTheDocument();
    // A zero "lainnya" row is noise, so it is not drawn.
    expect(
      screen.queryByText("Pendapatan & biaya lainnya"),
    ).not.toBeInTheDocument();

    expect(screen.getByText("Beban terbesar periode ini")).toBeInTheDocument();
    expect(screen.getByText("Beban Gaji")).toBeInTheDocument();
    expect(screen.getByText("Rp 32.000.000 · 76,1%")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------- biaya tetap */

  it("counts the biaya tetap coming due and names the soonest", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(
        /2 biaya tetap jatuh tempo ≤30 hari · Rp 11.500.000 total/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Terdekat: Sewa ruko/)).toBeInTheDocument();
    expect(fixedCostService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        kind: "expense",
        dueTo: "2026-09-15",
        sort: "dueSoonest",
      }),
    );
  });

  it("says nothing about biaya tetap when none is due", async () => {
    (fixedCostService.list as jest.Mock).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      totals: { in: { amount: "0", count: 0 }, out: { amount: "0", count: 0 } },
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(screen.queryByText(/biaya tetap jatuh tempo/)).not.toBeInTheDocument();
  });

  /* ------------------------------------------------------------- the chart */

  /**
   * SEVEN DAYS ENDING TODAY, WHATEVER THE PERIOD SAYS — a shape needs a fixed
   * number of points.
   */
  it("asks for a fixed seven-day window rather than the filtered period", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await waitFor(() =>
      expect(journalEntryService.trend).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: "2026-08-10", dateTo: "2026-08-16" }),
      ),
    );

    await pickCustomRange("2026-07-01", "2026-07-31");

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: "2026-07-01" }),
      ),
    );
    expect(journalEntryService.trend).toHaveBeenCalledTimes(1);
  });

  it("re-draws the chart when the branch changes, because that is whose money it is", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await userEvent.click(screen.getByLabelText("Filter cabang"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Cabang Kemang" }),
    );

    await waitFor(() =>
      expect(journalEntryService.trend).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "branch-kemang" }),
      ),
    );
  });

  /**
   * Two or more parts must not rest on colour alone, and every number must be
   * reachable without a pointer — a legend, and a table twin behind a toggle.
   */
  it("names each lini and offers the numbers as a table", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    const chart = screen
      .getByText("Pendapatan 7 hari per lini bisnis")
      .closest("[data-slot=card]") as HTMLElement;
    expect(await within(chart).findByText("Grooming")).toBeInTheDocument();
    expect(within(chart).getByText("Retail")).toBeInTheDocument();

    await userEvent.click(
      within(chart).getByRole("button", { name: "Tampilkan tabel" }),
    );

    const table = within(chart).getByRole("table");
    expect(table).toHaveTextContent("16 Agu 2026");
    // 1,9 jt grooming + 1 jt retail on the last day.
    expect(table).toHaveTextContent("Rp 2.900.000");
  });

  it("says a quiet week in words instead of drawing empty bars", async () => {
    (journalEntryService.trend as jest.Mock).mockResolvedValue({
      period: { dateFrom: "2026-08-10", dateTo: "2026-08-16", timezone: "Asia/Jakarta" },
      days: TREND_DAYS_FIXTURE.map((item) => ({ ...item, byBusinessLine: [] })),
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/Belum ada pendapatan tercatat di tujuh hari terakhir/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(NET_PROFIT).length).toBeGreaterThan(0);
  });

  it("keeps the cards when only the chart fails", async () => {
    (journalEntryService.trend as jest.Mock).mockRejectedValue(
      new ApiError("Rentang terlalu panjang", 400),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/Pendapatan 7 hari gagal dimuat/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(NET_PROFIT).length).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------- failures */

  it("says the ledger failed instead of showing zeroes", async () => {
    (journalEntryService.profitLoss as jest.Mock).mockRejectedValue(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/Ringkasan keuangan gagal dimuat/),
    ).toBeInTheDocument();
    expect(screen.getByText("Server sedang bermasalah")).toBeInTheDocument();
    expect(screen.queryByText(/Total laba bersih/i)).not.toBeInTheDocument();
  });

  it("dashes a card whose own module failed, never zeroes it", async () => {
    (customerInvoiceService.outstanding as jest.Mock).mockRejectedValue(
      new ApiError("Tidak bisa dihubungi", 503),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(await screen.findByText("Gagal dimuat")).toBeInTheDocument();
    expect(screen.queryByText("Rp 14.200.000")).not.toBeInTheDocument();
  });

  it("retries on demand", async () => {
    (journalEntryService.profitLoss as jest.Mock).mockRejectedValueOnce(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Muat ulang/ }),
    );

    await loaded();
  });

  it("re-queries the ledger and biaya tetap when the branch filter changes", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    await userEvent.click(screen.getByLabelText("Filter cabang"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Cabang Kemang" }),
    );

    await waitFor(() =>
      expect(journalEntryService.profitLoss).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "branch-kemang" }),
      ),
    );
    await waitFor(() =>
      expect(fixedCostService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "branch-kemang" }),
      ),
    );
  });

  /* ---------------------------------------------------------------- gates */

  it("leaves out the cards a role cannot read, without firing their requests", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "journalEntries", actions: ["read"] },
        { feature: "businessLines", actions: ["read"] },
        { feature: "branches", actions: ["read"] },
      ],
    });

    await loaded();

    expect(screen.queryByText(/Piutang belum tertagih/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Utang belum dibayar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total net cashflow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/biaya tetap jatuh tempo/)).not.toBeInTheDocument();
    expect(customerInvoiceService.outstanding).not.toHaveBeenCalled();
    expect(purchaseInvoiceService.outstandingSummary).not.toHaveBeenCalled();
    expect(cashTransactionService.list).not.toHaveBeenCalled();
    expect(fixedCostService.list).not.toHaveBeenCalled();
  });

  it("explains itself instead of showing zeroes without ledger access", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/belum punya akses ke jurnal umum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Total laba bersih/i)).not.toBeInTheDocument();
    expect(journalEntryService.profitLoss).not.toHaveBeenCalled();
  });

  /**
   * The statements moved to Laporan (22 September 2026). A landing page with
   * link cards the mockup does not draw was a second way in to three screens.
   */
  it("carries no module link cards — those are in Laporan now", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await loaded();

    expect(screen.queryByRole("link", { name: /Neraca/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Arus Kas/ })).not.toBeInTheDocument();
  });
});
