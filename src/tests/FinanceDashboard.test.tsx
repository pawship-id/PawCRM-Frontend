import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { FinanceDashboardScreen } from "@/features/accounting";
import {
  balanceOf,
  cashPosition,
  currentMonthRange,
  formatPercent,
  marginPct,
  previousMonthRange,
  trendWindow,
} from "@/features/accounting/financeSummary";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { ApiError } from "@/services/api-error";

jest.mock("@/services/journalEntry.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/purchaseInvoice.service");

/**
 * The Keuangan Ringkasan tab, and the pure module behind it.
 *
 * WHAT IS WORTH ASSERTING, following AccountingScreens: not a figure the demo
 * data happens to produce, but the contract between this screen and the four
 * modules it now reads.
 *
 *   - each read is made with the part of the filter it actually depends on —
 *     `balances` gets the END of the period because a balance is a position,
 *     piutang gets no period at all, and the chart gets its own fixed week;
 *   - the cards render what the APIs returned rather than a re-derivation;
 *   - a failed read says so rather than showing zeroes — the failure mode that
 *     turns a broken request into a reported loss — and a failure in one module
 *     does not blank the others;
 *   - a card whose grant is missing is ABSENT, which must not look like a card
 *     whose request failed.
 */

const NOW = "2026-08-16T04:00:00.000Z";
const GROOMING = "bl-grooming";
const RETAIL = "bl-retail";

const SUMMARY = {
  period: {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    timezone: "Asia/Jakarta",
  },
  revenue: "110750000.0000",
  expense: "91680000.0000",
  netProfit: "19070000.0000",
  entryCount: 30,
  byBusinessLine: [
    {
      businessLineId: RETAIL,
      revenue: "47850000.0000",
      expense: "34710000.0000",
      net: "13140000.0000",
    },
    {
      businessLineId: null,
      revenue: "0.0000",
      expense: "22570000.0000",
      net: "-22570000.0000",
    },
  ],
};

/** Kas and Utang Komisi — two classes, one unfiltered trial balance. */
const BALANCES = [
  {
    accountId: "acc-1101",
    code: "1101",
    name: "Kas",
    accountType: "asset",
    normalBalance: "debit",
    debit: "90000000.0000",
    credit: "10612500.0000",
    balance: "79387500.0000",
  },
  {
    accountId: "acc-2102",
    code: "2102",
    name: "Utang Komisi",
    accountType: "liability",
    normalBalance: "credit",
    debit: "1000000.0000",
    credit: "4318000.0000",
    balance: "3318000.0000",
  },
];

const TREND_DAYS_FIXTURE = [
  { date: "2026-08-10", revenue: "3000000.0000", expense: "1200000.0000", netProfit: "1800000.0000" },
  { date: "2026-08-11", revenue: "0.0000", expense: "0.0000", netProfit: "0.0000" },
  { date: "2026-08-12", revenue: "1500000.0000", expense: "0.0000", netProfit: "1500000.0000" },
  { date: "2026-08-13", revenue: "2100000.0000", expense: "900000.0000", netProfit: "1200000.0000" },
  { date: "2026-08-14", revenue: "2600000.0000", expense: "1100000.0000", netProfit: "1500000.0000" },
  { date: "2026-08-15", revenue: "3400000.0000", expense: "1500000.0000", netProfit: "1900000.0000" },
  { date: "2026-08-16", revenue: "2900000.0000", expense: "1250000.0000", netProfit: "1650000.0000" },
];

beforeEach(() => {
  (journalEntryService.summary as jest.Mock).mockResolvedValue(SUMMARY);
  (journalEntryService.balances as jest.Mock).mockResolvedValue({
    asOf: "2026-08-31",
    timezone: "Asia/Jakarta",
    accounts: BALANCES,
  });
  (journalEntryService.trend as jest.Mock).mockResolvedValue({
    period: {
      dateFrom: "2026-08-10",
      dateTo: "2026-08-16",
      timezone: "Asia/Jakarta",
    },
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
    collectedThisMonth: {
      amount: "0.0000",
      paymentCount: 0,
      from: "2026-08-01",
      to: "2026-08-31",
    },
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
  it("adds cash balances exactly, in minor units", () => {
    expect(
      cashPosition([
        { balance: "79387500.0000" },
        { balance: "0.1000" },
      ] as never),
    ).toBe("79387500.1000");
  });

  it("returns null rather than a margin against zero revenue", () => {
    expect(marginPct("-22570000.0000", "0.0000")).toBeNull();
    expect(formatPercent(null)).toBe("—");
  });

  it("computes a margin without dividing money in floating point", () => {
    expect(marginPct("19070000.0000", "110750000.0000")).toBe(17.2);
  });

  /**
   * An account with no postings is ABSENT from a trial balance, and reading that
   * as zero is correct here and only here: "nobody has ever been owed
   * commission" and "everybody has been paid" are both honestly Rp 0. A figure
   * whose absence meant a FAILED REQUEST would not be — that is the hook's
   * `error`, and the card dashes rather than zeroes for it.
   */
  it("reads a balance by code, and an absent account as zero", () => {
    expect(balanceOf(BALANCES as never, "2102")).toBe("3318000.0000");
    expect(balanceOf(BALANCES as never, "2103")).toBe("0");
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

  // Inclusive of today, so seven days is today and the six before it — the same
  // arithmetic the "7 hari" preset chip does, and deliberately the same answer.
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
      expect(journalEntryService.summary).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      ),
    );

    // No period means no `asOf` either: the cash card is the position now.
    expect(journalEntryService.balances).toHaveBeenCalledWith(
      expect.objectContaining({ asOf: undefined }),
    );
  });

  /**
   * ONE UNFILTERED TRIAL BALANCE, NOT ONE PER CLASS. The screen reads kas & bank
   * (1101/1102, assets) and utang komisi (2102, a liability) off the same
   * response; asking by `accountType` would mean two round trips for a payload
   * of a few dozen rows.
   */
  it("reads every account class from one balances call", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 79.387.500");

    expect(journalEntryService.balances).not.toHaveBeenCalledWith(
      expect.objectContaining({ accountType: expect.anything() }),
    );
    expect(screen.getByText("Rp 3.318.000")).toBeInTheDocument();
  });

  /**
   * A PILL APPLIES ON CLICK — no Terapkan, which is what §8 asks of a pill row
   * and what makes it worth the space over a dropdown.
   */
  it("sends the period a pill applied, and the balance for its end", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 19.070.000");

    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
        }),
      ),
    );

    // A balance is a POSITION as of a date, so only the end of the range says
    // anything about it. Sending `dateFrom` would turn it into a movement.
    expect(journalEntryService.balances).toHaveBeenLastCalledWith(
      expect.objectContaining({ asOf: "2026-08-31" }),
    );
    expect(journalEntryService.balances).not.toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: expect.anything() }),
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
    await screen.findByText("Rp 19.070.000");

    await pickCustomRange("2026-07-01", "2026-07-31");

    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
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
    await screen.findByText("Rp 19.070.000");

    const before = (journalEntryService.summary as jest.Mock).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(
      await screen.findByLabelText("Periode khusus dari"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Periode khusus sampai")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Periode khusus dari"), {
      target: { value: "2026-07-01" },
    });

    expect((journalEntryService.summary as jest.Mock).mock.calls).toHaveLength(
      before,
    );
  });

  /**
   * RESET DOES NOT WAIT FOR TERAPKAN (§8). It clears and re-queries in the same
   * click, which is what makes it safe to reach for.
   */
  it("clears an applied range in one click", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 19.070.000");

    await pickCustomRange("2026-07-01", "2026-07-31");
    await screen.findByRole("button", { name: /Hapus filter Periode/ });

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
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
    await screen.findByText("Rp 19.070.000");

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
    await screen.findByText("Rp 19.070.000");

    await userEvent.click(screen.getByRole("button", { name: "Hari ini" }));
    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: "2026-08-16" }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Semua" }));
    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
      ),
    );
  });

  it("renders the figures the APIs returned, not a re-derivation", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    // Laba bersih, from /summary.
    expect(await screen.findByText("Rp 19.070.000")).toBeInTheDocument();
    // Kas & bank, summed from the balances it was given.
    expect(screen.getByText("Rp 79.387.500")).toBeInTheDocument();
    // Masuk and keluar, from the cash transactions' own totals.
    expect(screen.getByText("Rp 62.400.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 38.100.000")).toBeInTheDocument();
    // Piutang and utang, each from its module's outstanding aggregate.
    expect(screen.getByText("Rp 14.200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 8.600.000")).toBeInTheDocument();
  });

  /**
   * The one figure on the screen the browser computes, and it is exact: two
   * server-side aggregates subtracted in minor units, never a sum over rows.
   */
  it("derives arus kas bersih from masuk minus keluar", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Rp 24.300.000")).toBeInTheDocument();
  });

  it("labels the unattributed bucket as unallocated rather than as a margin", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText(/Beban bersama/)).toBeInTheDocument();
    expect(screen.getByText(/belum dibagi ke lini/)).toBeInTheDocument();
    // And the named line does get one, resolved through /business-lines.
    expect(screen.getByText(/Margin Retail/)).toBeInTheDocument();
  });

  /**
   * A period with no sales still has a net profit arithmetically — an inventory
   * surplus credits 5201 Kerugian Persediaan, so expense goes negative and
   * `0 − (−x)` is positive. Painting that green claims a profit nobody earned,
   * and on a tenant still being set up it is every period.
   */
  it("does not claim a profit when there was no revenue", async () => {
    (journalEntryService.summary as jest.Mock).mockResolvedValue({
      ...SUMMARY,
      revenue: "0.0000",
      expense: "-1105100.0000",
      netProfit: "1105100.0000",
      byBusinessLine: [],
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    const value = await screen.findByText("Rp 1.105.100");
    expect(value).not.toHaveClass("text-success");
    expect(
      screen.getByText("Belum ada pendapatan di periode ini"),
    ).toBeInTheDocument();
  });

  it("still colours a real profit", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Rp 19.070.000")).toHaveClass("text-success");
    expect(screen.getByText(/margin 17,2%/)).toBeInTheDocument();
  });

  /* ------------------------------------------------------------- the chart */

  /**
   * SEVEN DAYS ENDING TODAY, WHATEVER THE PERIOD SAYS. A chart is a shape over
   * time and a shape needs a fixed number of points: following the filter would
   * draw thirty on "Bulan lalu", one on "Hari ini", and a tenant's whole history
   * on "Semua".
   */
  it("asks for a fixed seven-day window rather than the filtered period", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await waitFor(() =>
      expect(journalEntryService.trend).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: "2026-08-10",
          dateTo: "2026-08-16",
        }),
      ),
    );

    await pickCustomRange("2026-07-01", "2026-07-31");

    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: "2026-07-01" }),
      ),
    );

    // The period moved and the chart did not — one call, still this week.
    expect(journalEntryService.trend).toHaveBeenCalledTimes(1);
  });

  it("re-draws the chart when the branch changes, because that is whose money it is", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 19.070.000");

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
   * Two series on one chart must not rest on colour alone, and the numbers must
   * be reachable without a pointer — hence a legend, an end label, and a table
   * twin behind one toggle.
   */
  it("names both series and offers the numbers as a table", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText("Kotor (pendapatan)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Bersih (laba)")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tampilkan tabel" }),
    );

    const table = await screen.findByRole("table");
    expect(table).toHaveTextContent("16 Agu 2026");
    expect(table).toHaveTextContent("Rp 2.900.000");
  });

  /**
   * THE COMMON CASE ON A NEW TENANT, not an edge one. The API returns a point for
   * every day in the range, so a shop that has not traded this week gets seven
   * ZEROS rather than an empty array — and drawing those is two flat lines along
   * the bottom of an axis with nothing on it, which reads as a broken chart
   * rather than as a quiet week.
   */
  it("says a quiet week in words instead of drawing a flat line", async () => {
    (journalEntryService.trend as jest.Mock).mockResolvedValue({
      period: {
        dateFrom: "2026-08-10",
        dateTo: "2026-08-16",
        timezone: "Asia/Jakarta",
      },
      days: TREND_DAYS_FIXTURE.map((day) => ({
        ...day,
        revenue: "0.0000",
        expense: "0.0000",
        netProfit: "0.0000",
      })),
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/Belum ada pendapatan atau beban tercatat/),
    ).toBeInTheDocument();
    // And the cards above it are untouched — a quiet week is not a failure.
    expect(screen.getByText("Rp 19.070.000")).toBeInTheDocument();
  });

  /**
   * The chart is one read of five. A 400 from it must not blank the cards, which
   * came from other requests and are still true.
   */
  it("keeps the cards when only the chart fails", async () => {
    (journalEntryService.trend as jest.Mock).mockRejectedValue(
      new ApiError("Rentang terlalu panjang", 400),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText(/Tren 7 hari gagal dimuat/)).toBeInTheDocument();
    expect(screen.getByText("Rp 19.070.000")).toBeInTheDocument();
  });

  /* ------------------------------------------------------------- failures */

  /**
   * The failure mode that matters: a request that failed must not render as a
   * business that earned nothing. Somebody quotes the number on this screen.
   */
  it("says the summary failed instead of showing zeroes", async () => {
    (journalEntryService.summary as jest.Mock).mockRejectedValue(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/Ringkasan keuangan gagal dimuat/),
    ).toBeInTheDocument();
    expect(screen.getByText("Server sedang bermasalah")).toBeInTheDocument();
    expect(screen.queryByText(/Laba bersih periode/i)).not.toBeInTheDocument();
  });

  /**
   * The same rule one module down. Piutang failing is not the ledger failing, so
   * the page stands — but its card must dash rather than read Rp 0, which is a
   * shop that is owed nothing and a very different fact.
   */
  it("dashes a card whose own module failed, never zeroes it", async () => {
    (customerInvoiceService.outstanding as jest.Mock).mockRejectedValue(
      new ApiError("Tidak bisa dihubungi", 503),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Rp 19.070.000")).toBeInTheDocument();
    expect(screen.getByText("Gagal dimuat")).toBeInTheDocument();
    expect(screen.queryByText("Rp 14.200.000")).not.toBeInTheDocument();
  });

  it("retries on demand", async () => {
    (journalEntryService.summary as jest.Mock).mockRejectedValueOnce(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Muat ulang/ }),
    );

    expect(await screen.findByText("Rp 19.070.000")).toBeInTheDocument();
  });

  it("re-queries the ledger when the branch filter changes", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 19.070.000");

    await userEvent.click(screen.getByLabelText("Filter cabang"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Cabang Kemang" }),
    );

    await waitFor(() =>
      expect(journalEntryService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "branch-kemang" }),
      ),
    );
  });

  /* ---------------------------------------------------------------- gates */

  /**
   * ABSENT IS NOT DASHED. A dash means "this failed to load"; leaving the card
   * out means "not yours to see". A role without the purchase book is also not
   * asked to wait for a request it would be refused.
   */
  it("leaves out the cards a role cannot read, without firing their requests", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "journalEntries", actions: ["read"] },
        { feature: "businessLines", actions: ["read"] },
        { feature: "branches", actions: ["read"] },
      ],
    });

    await screen.findByText("Rp 19.070.000");

    expect(screen.queryByText(/Piutang belum tertagih/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Utang belum dibayar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Uang masuk/i)).not.toBeInTheDocument();
    expect(customerInvoiceService.outstanding).not.toHaveBeenCalled();
    expect(purchaseInvoiceService.outstandingSummary).not.toHaveBeenCalled();
    expect(cashTransactionService.list).not.toHaveBeenCalled();
  });

  it("explains itself instead of showing zeroes without ledger access", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/belum punya akses ke jurnal umum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Laba bersih periode/i)).not.toBeInTheDocument();
    expect(journalEntryService.summary).not.toHaveBeenCalled();
  });

  /**
   * The list of movements has a home of its own now. A landing page repeating
   * its first ten rows would be a second, staler answer one tab along — and the
   * only table here is the chart's own twin, which is behind a toggle.
   */
  it("carries no transaction list — that is the Transaksi tab", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 19.070.000");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Transaksi terakhir/i)).not.toBeInTheDocument();
  });

  /**
   * The mockup counts the active recurring costs and names the next one due.
   * Nothing executes `recurring` yet, so every one of those numbers would be
   * invented — and an invented figure on a finance screen is indistinguishable
   * from a real one.
   */
  it("badges biaya tetap as pending rather than inventing its figures", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Biaya tetap")).toBeInTheDocument();
    expect(screen.getByText("Segera")).toBeInTheDocument();
  });
});
