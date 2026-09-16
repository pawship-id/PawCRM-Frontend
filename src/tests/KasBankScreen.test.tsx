import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { KasBankScreen } from "@/features/payment-channels";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import { cashPage, channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/journalEntry.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/keuangan/kas-bank",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * KAS & BANK — the half of the page above the sub-tabs: three cards, the channel
 * table, and one context bar driving all of it.
 *
 * WHAT IS WORTH ASSERTING here rather than in the transaction list's own suite
 * (CashTransactionsScreen.test.tsx): that the money figures come from the
 * server's aggregates rather than a sum of the rows, that one period drives
 * every read on the page, and — the one this table can get wrong in a way that
 * still looks right — that a balance shared by two channels is printed once.
 */
const NOW = "2026-09-16T04:00:00.000Z";

/** Two channels on ONE account, and a third on its own. */
const KAS_PUSAT = channel({
  _id: "ch-kas-pusat",
  name: "Kas Pusat",
  type: "cash",
  accountId: "acc-1101",
  branchId: "b1",
});
const KAS_BARAT = channel({
  _id: "ch-kas-barat",
  name: "Kas Cabang Barat",
  type: "cash",
  accountId: "acc-1101",
  branchId: "b2",
});
const BANK = channel({
  _id: "ch-bank",
  name: "Bank BCA",
  type: "transfer",
  accountId: "acc-1102",
});

const TOTALS = {
  in: { amount: "166300000.0000", count: 70 },
  out: { amount: "111200000.0000", count: 38 },
};

beforeEach(() => {
  jest.clearAllMocks();

  asMock(cashTransactionService.list).mockResolvedValue(cashPage([], TOTALS));
  asMock(cashTransactionService.summaryByChannel).mockResolvedValue({
    channels: [
      {
        channelId: "ch-kas-pusat",
        in: { amount: "48200000.0000", count: 20 },
        out: { amount: "31900000.0000", count: 11 },
      },
      {
        channelId: "ch-bank",
        in: { amount: "72400000.0000", count: 30 },
        out: { amount: "41800000.0000", count: 14 },
      },
      // ch-kas-barat is ABSENT — nothing moved through it, which a caller reads
      // as zero rather than as missing.
    ],
  });
  asMock(paymentChannelService.list).mockResolvedValue(
    channelPage([KAS_PUSAT, KAS_BARAT, BANK]),
  );
  asMock(journalEntryService.balances).mockResolvedValue({
    asOf: null,
    timezone: "Asia/Jakarta",
    accounts: [
      {
        accountId: "acc-1101",
        code: "1101",
        name: "Kas",
        accountType: "asset",
        normalBalance: "debit",
        debit: "0",
        credit: "0",
        balance: "62400000.0000",
      },
      {
        accountId: "acc-1102",
        code: "1102",
        name: "Bank",
        accountType: "asset",
        normalBalance: "debit",
        debit: "0",
        credit: "0",
        balance: "84900000.0000",
      },
    ],
  });
  asMock(chartOfAccountsService.list).mockResolvedValue({
    items: [
      { _id: "acc-1101", code: "1101", name: "Kas" },
      { _id: "acc-1102", code: "1102", name: "Bank" },
    ] as never,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  asMock(branchService.list).mockResolvedValue({
    items: [
      { _id: "b1", name: "Cabang Pusat" },
      { _id: "b2", name: "Cabang Barat" },
    ] as never,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

/** The table paints after its three reads settle, so every lookup awaits it. */
const rowFor = async (name: string) =>
  within((await screen.findByText(name)).closest("tr")!);

describe("Kas & Bank — the cards", () => {
  it("shows the server's whole-filter totals and the net between them", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(await screen.findByText("Rp 166.300.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 111.200.000")).toBeInTheDocument();
    // Derived from the two aggregates, never summed over the rows on the page.
    expect(screen.getByText("Rp 55.100.000")).toBeInTheDocument();
  });
});

describe("Kas & Bank — the account table", () => {
  it("puts each channel's movement beside its account", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = await rowFor("Kas Pusat");
    expect(row.getByText("1101 · Kas")).toBeInTheDocument();
    expect(row.getByText("Rp 48.200.000")).toBeInTheDocument();
    expect(row.getByText("Rp 31.900.000")).toBeInTheDocument();
    expect(row.getByText("Cabang Pusat")).toBeInTheDocument();
  });

  /**
   * THE ONE THIS TABLE CAN GET WRONG AND STILL LOOK RIGHT. Two channels point at
   * account 1101; printing its balance on both invites a reader to add the
   * column up and report twice the cash the shop has.
   */
  it("prints a shared account's balance once, and says where the other went", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    await screen.findByText("Rp 62.400.000");
    expect(screen.getAllByText("Rp 62.400.000")).toHaveLength(1);

    expect(
      (await rowFor("Kas Cabang Barat")).getByText(/ikut Kas Pusat/),
    ).toBeInTheDocument();
  });

  /** A channel with no movement is absent from the summary, not zero-filled. */
  it("reads a channel the summary does not mention as zero", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = await rowFor("Kas Cabang Barat");
    expect(row.getAllByText("Rp 0")).toHaveLength(2);
  });

  it("names every branch on a channel that belongs to none", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(
      (await rowFor("Bank BCA")).getByText("Semua cabang"),
    ).toBeInTheDocument();
  });
});

describe("Kas & Bank — one period for the whole page", () => {
  /**
   * THE CARDS, THE TABLE AND THE ROWS MUST BE ABOUT ONE MONTH. They come from
   * three different reads, so the context bar has to reach all three — a period
   * that moved the cards and not the table would be worse than no filter.
   */
  it("sends the period to the list, the summary and the balances", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("Rp 166.300.000");

    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    await waitFor(() =>
      expect(cashTransactionService.summaryByChannel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        }),
      ),
    );
    expect(cashTransactionService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: "2026-09-01", dateTo: "2026-09-30" }),
    );
    // A balance is a POSITION as of a date, so it takes the END of the range.
    expect(journalEntryService.balances).toHaveBeenLastCalledWith(
      expect.objectContaining({ asOf: "2026-09-30" }),
    );
  });

  /**
   * NO LINI BISNIS. A rupiah in the till belongs to the shop, not to grooming or
   * retail — the control is left out rather than disabled, because one that
   * cannot narrow anything is worse than one that is not there.
   */
  it("offers no business-line filter", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("Rp 166.300.000");

    expect(screen.queryByLabelText("Filter lini bisnis")).not.toBeInTheDocument();
  });
});

describe("Kas & Bank — the sub-tabs", () => {
  it("offers Transaksi and Biaya Tetap, and opens on Transaksi", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(
      await screen.findByRole("link", { name: "Transaksi" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/kas-bank");
    expect(screen.getByRole("link", { name: "Biaya Tetap" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/biaya-tetap",
    );
    // The list's own controls, which only the first sub-tab carries.
    expect(screen.getByLabelText("Cari transaksi")).toBeInTheDocument();
  });

  /**
   * The mockup counts the active recurring costs and names the next one due.
   * Nothing executes `recurring` yet, so every one of those figures would be
   * invented — and an invented figure on a finance screen is indistinguishable
   * from a real one.
   */
  it("badges Biaya Tetap as pending rather than inventing its figures", async () => {
    renderWithAuth(<KasBankScreen now={NOW} section="biaya-tetap" />);

    expect(await screen.findByText("Segera")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cari transaksi")).not.toBeInTheDocument();
    // The cards and the table are the page's subject, so they stay on both.
    expect(screen.getByText("Rp 166.300.000")).toBeInTheDocument();
  });
});

describe("Kas & Bank — grants", () => {
  /**
   * THE MOVE MUST NOT TAKE THE LIST AWAY FROM ANYBODY. A role that could read
   * transactions and not channels used to have a tab of its own; now it shares
   * this page, and it must still get its half.
   */
  it("gives a transactions-only role the list without the channel table", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    expect(await screen.findByLabelText("Cari transaksi")).toBeInTheDocument();
    expect(screen.queryByText("Akun Kas & Bank")).not.toBeInTheDocument();
    /*
      The TABLE's read is the one that does not fire. `/payment-channels` still
      does — the transaction panel's own Channel filter needs the options, and
      that request is made by `useCashTransactions`, not by the table.
    */
    expect(cashTransactionService.summaryByChannel).not.toHaveBeenCalled();
  });

  it("gives a channels-only role the table without the cards or the list", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "paymentChannels", actions: ["read"] }],
    });

    expect(await screen.findByText("Kas Pusat")).toBeInTheDocument();
    expect(screen.queryByText("Rp 166.300.000")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cari transaksi")).not.toBeInTheDocument();
  });
});
