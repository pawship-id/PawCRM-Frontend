import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { FinanceDashboardScreen } from "@/features/accounting";
import {
  cashPosition,
  currentMonthRange,
  financeTransactions,
  formatPercent,
  marginPct,
  previousMonthRange,
} from "@/features/accounting/financeSummary";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { ApiError } from "@/services/api-error";
import type { ChartOfAccount, JournalEntry } from "@/types/accounting";

jest.mock("@/services/journalEntry.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/chartOfAccounts.service");

/**
 * The Keuangan dashboard, and the two pure modules behind it.
 *
 * WHAT IS WORTH ASSERTING, following AccountingScreens: not a figure the demo
 * data happens to produce, but the contract between this screen and the API it
 * now reads.
 *
 *   - the three ledger calls are made with the period the toolbar holds, and
 *     `balances` gets the END of it rather than the range, because a balance is
 *     a position;
 *   - the cards render what `/summary` returned rather than a re-derivation;
 *   - a failure says so and offers a retry, instead of showing zeroes — the
 *     failure mode that turns a broken request into a reported loss;
 *   - the transaction projection keeps its properties: only P&L entries, one row
 *     per entry, a return read as a decrease.
 */

const NOW = "2026-08-16T04:00:00.000Z";
const GROOMING = "bl-grooming";
const RETAIL = "bl-retail";

const account = (
  _id: string,
  code: string,
  name: string,
  accountType: ChartOfAccount["accountType"],
): ChartOfAccount => ({
  _id,
  code,
  name,
  accountType,
  parentAccountId: null,
  businessLineId: null,
  isDefault: false,
  isActive: true,
});

const ACCOUNTS = [
  account("acc-1101", "1101", "Kas", "asset"),
  account("acc-4101", "4101", "Penjualan", "income"),
  account("acc-5101", "5101", "Harga Pokok Penjualan", "expense"),
  account("acc-5302", "5302", "Beban Sewa", "expense"),
  account("acc-2101", "2101", "Utang Supplier", "liability"),
  account("acc-1201", "1201", "Persediaan", "asset"),
];

const ACCOUNTS_BY_ID = new Map(ACCOUNTS.map((item) => [item._id, item]));

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  _id: "je-1",
  entryNumber: "JE-2026-08-0001",
  date: "2026-08-10",
  description: "Rekap penjualan POS harian",
  branchId: "branch-kemang",
  branchName: "Cabang Kemang",
  source: { type: "pos", id: "pos-1", reference: null },
  lines: [
    {
      accountId: "acc-1101",
      businessLineId: null,
      debit: "1100000.0000",
      credit: "0.0000",
      memo: null,
    },
    {
      accountId: "acc-4101",
      businessLineId: RETAIL,
      debit: "0.0000",
      credit: "1000000.0000",
      memo: null,
    },
    {
      accountId: "acc-5101",
      businessLineId: RETAIL,
      debit: "400000.0000",
      credit: "0.0000",
      memo: null,
    },
  ],
  cashflowType: "operating",
  tags: [],
  attachmentUrl: null,
  recurring: { enabled: false, interval: null },
  reversedByEntryId: null,
  reversesEntryId: null,
  createdByName: null,
  createdAt: "2026-08-10",
  ...overrides,
});

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

beforeEach(() => {
  (journalEntryService.summary as jest.Mock).mockResolvedValue(SUMMARY);
  (journalEntryService.balances as jest.Mock).mockResolvedValue({
    asOf: "2026-08-31",
    timezone: "Asia/Jakarta",
    accounts: [
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
    ],
  });
  (journalEntryService.list as jest.Mock).mockResolvedValue({
    items: [entry()],
    pagination: { page: 1, limit: 10, total: 30, totalPages: 3 },
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
  (chartOfAccountsService.tree as jest.Mock).mockResolvedValue(
    ACCOUNTS.map((item) => ({ ...item, children: [] })),
  );
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

  it("lists only entries that moved the profit and loss", () => {
    // A goods receipt: stock in, payable up. Real, but neither income nor
    // expense, so it has no place in a list under the P&L cards.
    const receipt = entry({
      _id: "je-2",
      lines: [
        {
          accountId: "acc-1201",
          businessLineId: null,
          debit: "900000.0000",
          credit: "0.0000",
          memo: null,
        },
        {
          accountId: "acc-2101",
          businessLineId: null,
          debit: "0.0000",
          credit: "900000.0000",
          memo: null,
        },
      ],
    });

    const rows = financeTransactions([entry(), receipt], ACCOUNTS_BY_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0].entry._id).toBe("je-1");
  });

  /**
   * A POS recap credits revenue and debits HPP in ONE entry. Two rows would show
   * a sale and a cost that look like separate events; the row carries the
   * revenue, because that is the transaction.
   */
  it("folds an entry with both sides into one revenue row", () => {
    const [row] = financeTransactions([entry()], ACCOUNTS_BY_ID);

    expect(row.type).toBe("income");
    expect(row.amount).toBe("1000000.0000");
    expect(row.reversal).toBe(false);
  });

  it("marks a sales return as revenue going down, not another sale", () => {
    const refund = entry({
      lines: [
        {
          accountId: "acc-4101",
          businessLineId: RETAIL,
          debit: "180000.0000",
          credit: "0.0000",
          memo: null,
        },
        {
          accountId: "acc-1101",
          businessLineId: null,
          debit: "0.0000",
          credit: "180000.0000",
          memo: null,
        },
      ],
    });

    const [row] = financeTransactions([refund], ACCOUNTS_BY_ID);

    expect(row.type).toBe("income");
    expect(row.reversal).toBe(true);
    // Positive, because the direction is `reversal`'s job — the screen prints
    // the minus sign, and printing it twice is how a column stops adding up.
    expect(row.amount).toBe("180000.0000");
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
});

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
      expect.objectContaining({ asOf: undefined, accountType: "asset" }),
    );

    expect(journalEntryService.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, page: 1 }),
    );
  });

  it("sends the period the picker applied, and the balance for its end", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 110.750.000");

    await userEvent.click(screen.getByLabelText("Periode laporan"));
    await userEvent.click(await screen.findByRole("button", { name: "Bulan ini" }));
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

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
      expect.objectContaining({ asOf: "2026-08-31", accountType: "asset" }),
    );
    expect(journalEntryService.balances).not.toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: expect.anything() }),
    );

    // And it is a filter now, so it says so and can be taken off again.
    expect(
      await screen.findByRole("button", {
        name: /Hapus filter Periode 1 Ags–31 Ags/,
      }),
    ).toBeInTheDocument();
  });

  it("renders the figures the API returned, not a re-derivation", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(await screen.findByText("Rp 110.750.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 91.680.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 19.070.000")).toBeInTheDocument();
    // The cash card sums the balances of the kas/bank accounts it was given.
    expect(screen.getByText("Rp 79.387.500")).toBeInTheDocument();
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

  it("explains a negative expense instead of leaving it to be read as a bug", async () => {
    (journalEntryService.summary as jest.Mock).mockResolvedValue({
      ...SUMMARY,
      revenue: "0.0000",
      expense: "-1105100.0000",
      netProfit: "1105100.0000",
      byBusinessLine: [],
    });

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    expect(
      await screen.findByText(/ada akun beban yang dikredit/),
    ).toBeInTheDocument();
  });

  it("still colours a real profit and a real loss", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    // The default fixture has revenue, so the margin is meaningful again.
    expect(await screen.findByText("Rp 19.070.000")).toHaveClass(
      "text-success",
    );
    expect(screen.getByText("Margin bersih 17,2%")).toBeInTheDocument();
  });

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
    expect(screen.queryByText("Total Revenue")).not.toBeInTheDocument();
  });

  it("retries on demand", async () => {
    (journalEntryService.summary as jest.Mock).mockRejectedValueOnce(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Muat ulang/ }),
    );

    expect(await screen.findByText("Rp 110.750.000")).toBeInTheDocument();
  });

  it("re-queries the ledger when the branch filter changes", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);
    await screen.findByText("Rp 110.750.000");

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

  it("shows at most ten rows and hands off to the ledger for the rest", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />);

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row").length).toBeLessThanOrEqual(11);

    expect(screen.getByRole("link", { name: /Lihat semua/ })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/journal-entries",
    );
  });

  it("explains itself instead of showing zeroes without ledger access", async () => {
    renderWithAuth(<FinanceDashboardScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/belum punya akses ke jurnal umum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Total Revenue")).not.toBeInTheDocument();
    expect(journalEntryService.summary).not.toHaveBeenCalled();
  });
});
